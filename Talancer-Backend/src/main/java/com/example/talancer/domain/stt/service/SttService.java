package com.example.talancer.domain.stt.service;

import com.example.talancer.common.exception.BusinessException;
import com.example.talancer.common.exception.ErrorCode;
import com.example.talancer.domain.meeting.entity.MeetingAnalysis;
import com.example.talancer.domain.meeting.entity.Meeting;
import com.example.talancer.domain.meeting.entity.MeetingTask;
import com.example.talancer.domain.meeting.entity.Status;
import com.example.talancer.domain.meeting.repository.MeetingAnalysisRepository;
import com.example.talancer.domain.meeting.repository.MeetingRepository;
import com.example.talancer.domain.meeting.repository.MeetingTaskRepository;
import com.example.talancer.domain.summary.dto.SummaryRspDto;
import com.example.talancer.domain.summary.service.SummaryService;
import com.example.talancer.domain.stt.dto.*;
import com.example.talancer.domain.verb.entity.Verb;
import com.example.talancer.domain.verb.repository.VerbRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SttService {
    private static final Pattern SPEAKER_LINE_PATTERN = Pattern.compile("^\\s*([^:]{1,40}):\\s*(.+)$");

    private final MeetingRepository meetingRepository;
    private final MeetingAnalysisRepository meetingAnalysisRepository;
    private final MeetingTaskRepository meetingTaskRepository;
    private final VerbRepository verbRepository;
    private final MinioStorageService minioStorageService;
    private final RestTemplate restTemplate;
    private final SummaryService summaryService;

    @Value("${ai.server.base-url:http://ai:8001}")
    private String aiServerBaseUrl;

    public SttProcessResponse processMeetingAudio(
            Long meetingId,
            MultipartFile audio,
            String language,
            Integer minSpeakers,
            Integer maxSpeakers
    ) {
        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_MEETING));

        if (audio == null || audio.isEmpty()) {
            throw new IllegalArgumentException("audio file is required");
        }

        String originalName = Optional.ofNullable(audio.getOriginalFilename()).orElse("meeting-audio.webm");
        String contentType = Optional.ofNullable(audio.getContentType()).orElse("application/octet-stream");
        String objectKey = buildRawAudioObjectKey(meetingId, originalName);

        try {
            minioStorageService.upload(objectKey, audio.getInputStream(), audio.getSize(), contentType);
        }
        catch (IOException e) {
            throw new RuntimeException("Failed to read uploaded audio", e);
        }

        meeting.updateAudio(objectKey, originalName, contentType);
        meeting.updateStatus(Status.POST_PROCESSING);
        meetingRepository.save(meeting);

        triggerAiBatchDiarize(meetingId, audio, language, minSpeakers, maxSpeakers);

        return new SttProcessResponse(meetingId, "POST_PROCESSING", "Audio uploaded and AI processing started");
    }

    @Transactional
    public void handleBatch(AiBatchPayload payload) {
        if (payload == null || payload.meetingId() == null) {
            throw new IllegalArgumentException("meetingId is required");
        }

        Meeting meeting = meetingRepository.findById(payload.meetingId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_MEETING));

        String text = Optional.ofNullable(payload.text()).orElse("").trim();

        verbRepository.deleteAllByMeetingMeetingId(meeting.getMeetingId());
        if (!text.isBlank()) {
            Verb single = Verb.builder()
                    .speaker("SPEAKER_00")
                    .start(0.0)
                    .end(0.0)
                    .text(text)
                    .meeting(meeting)
                    .build();
            verbRepository.save(single);
        }

        saveSummaryAndTasks(meeting, text);
        meeting.updateStatus(Status.COMPLETED);
    }

    @Transactional
    public void handleBatchDiarize(AiBatchDiarizePayload payload) {
        if (payload == null || payload.meetingId() == null) {
            throw new IllegalArgumentException("meetingId is required");
        }

        Meeting meeting = meetingRepository.findById(payload.meetingId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_MEETING));

        List<AiSegmentPayload> segments = Optional.ofNullable(payload.segments()).orElse(List.of());
        verbRepository.deleteAllByMeetingMeetingId(meeting.getMeetingId());

        if (!segments.isEmpty()) {
            List<Verb> verbs = segments.stream()
                    .filter(s -> s != null && s.text() != null && !s.text().isBlank())
                    .map(s -> {
                        double startSec = resolveSeconds(s.start(), s.startMs());
                        double endSec = resolveSeconds(s.end(), s.endMs());
                        if (endSec < startSec) {
                            endSec = startSec;
                        }

                        return Verb.builder()
                                .speaker(Optional.ofNullable(s.speaker()).orElse("SPEAKER_UNKNOWN"))
                                .start(startSec)
                                .end(endSec)
                                .text(s.text())
                                .meeting(meeting)
                                .build();
                    })
                    .toList();

            if (!verbs.isEmpty()) {
                verbRepository.saveAll(verbs);
            }
        }

        String fullText = Optional.ofNullable(payload.fullText())
                .filter(t -> !t.isBlank())
                .orElseGet(() -> segments.stream()
                        .filter(s -> s != null && s.text() != null && !s.text().isBlank())
                        .map(s -> Optional.ofNullable(s.speaker()).orElse("SPEAKER_UNKNOWN") + ": " + s.text())
                        .reduce((a, b) -> a + "\n" + b)
                        .orElse(""));

        saveSummaryAndTasks(meeting, fullText);
        meeting.updateStatus(Status.COMPLETED);
    }

    @Transactional(readOnly = true)
    public TranscriptResponse getTranscript(Long meetingId) {
        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_MEETING));

        List<TranscriptSegmentDto> segments = verbRepository.findAllByMeetingMeetingIdOrderByStartAsc(meetingId)
                .stream()
                .map(v -> new TranscriptSegmentDto(
                        v.getVerbId(),
                        v.getSpeaker(),
                        v.getStart(),
                        v.getEnd(),
                        v.getText()
                ))
                .toList();

        String audioUrl = meeting.getAudioObjectKey() == null ? null : "/api/stt/meetings/" + meetingId + "/audio";
        String audioDownloadUrl = meeting.getAudioObjectKey() == null
                ? null
                : "/api/stt/meetings/" + meetingId + "/audio?download=true";
        List<AnalysisTaskDto> tasks = readAnalysisTasks(meetingId);
        String summary = readSummary(meetingId);
        String transcript = buildTranscript(segments);

        return new TranscriptResponse(
                meetingId,
                meeting.getStatus(),
                transcript,
                summary,
                tasks,
                audioUrl,
                audioDownloadUrl,
                segments
        );
    }

    @Transactional
    public SpeakerUpdateResponse updateSpeakers(Long meetingId, SpeakerUpdateRequest request) {
        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_MEETING));

        Map<String, String> renameMap = Optional.ofNullable(request)
                .map(SpeakerUpdateRequest::renames)
                .orElse(List.of())
                .stream()
                .filter(Objects::nonNull)
                .map(rename -> Map.entry(
                        normalizeSpeaker(rename.from()),
                        normalizeSpeaker(rename.to())
                ))
                .filter(entry -> !entry.getKey().isBlank())
                .filter(entry -> !entry.getValue().isBlank())
                .filter(entry -> !entry.getKey().equals(entry.getValue()))
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        Map.Entry::getValue,
                        (left, right) -> right,
                        LinkedHashMap::new
                ));

        if (renameMap.isEmpty()) {
            throw new IllegalArgumentException("at least one valid speaker rename is required");
        }

        List<Verb> verbs = verbRepository.findAllByMeetingMeetingIdOrderByStartAsc(meetingId);
        int updatedCount = 0;

        for (Verb verb : verbs) {
            String currentSpeaker = normalizeSpeaker(
                    Optional.ofNullable(verb.getSpeaker()).orElse("SPEAKER_UNKNOWN")
            );
            String nextSpeaker = renameMap.get(currentSpeaker);
            if (nextSpeaker == null) {
                continue;
            }

            verb.updateSpeaker(nextSpeaker);
            updatedCount++;
        }

        if (updatedCount > 0) {
            verbRepository.saveAll(verbs);
        }

        return new SpeakerUpdateResponse(meeting.getMeetingId(), updatedCount);
    }

    @Transactional(readOnly = true)
    public ResponseEntity<byte[]> getMeetingAudio(Long meetingId, boolean download) {
        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_MEETING));

        if (meeting.getAudioObjectKey() == null) {
            return ResponseEntity.notFound().build();
        }

        byte[] bytes = minioStorageService.getObjectBytes(meeting.getAudioObjectKey());

        String contentType = Optional.ofNullable(meeting.getAudioContentType()).orElse("application/octet-stream");
        String fileName = Optional.ofNullable(meeting.getAudioFileName()).orElse("meeting-" + meetingId + ".audio");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(contentType));
        headers.setContentLength(bytes.length);

        if (download) {
            String encoded = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");
            headers.setContentDisposition(ContentDisposition.attachment().filename(encoded, StandardCharsets.UTF_8).build());
        }

        return new ResponseEntity<>(bytes, headers, HttpStatus.OK);
    }

    private String buildRawAudioObjectKey(Long meetingId, String originalName) {
        String safeName = originalName.replaceAll("[^a-zA-Z0-9._-]", "_");
        return "meetings/" + meetingId + "/raw/" + System.currentTimeMillis() + "-" + safeName;
    }

    private void saveSummaryAndTasks(Meeting meeting, String text) {
        String normalized = Optional.ofNullable(text).orElse("").trim();
        SummaryRspDto safeResult;

        if (normalized.isBlank()) {
            safeResult = new SummaryRspDto("(요약 없음)", List.of());
        } else {
            try {
                SummaryRspDto result = summaryService.processRawText(normalized);
                safeResult = sanitizeSummaryResult(result, normalized);
            }
            catch (Exception e) {
                safeResult = buildFallbackSummary(normalized);
            }
        }

        upsertAnalysis(meeting, safeResult.summary());
        replaceTasks(meeting, safeResult.tasks());
    }

    private void upsertAnalysis(Meeting meeting, String summary) {
        String safeSummary = Optional.ofNullable(summary)
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .orElse("(요약 없음)");

        MeetingAnalysis analysis = meetingAnalysisRepository.findByMeetingMeetingId(meeting.getMeetingId())
                .orElseGet(() -> MeetingAnalysis.builder()
                        .meeting(meeting)
                        .summary(safeSummary)
                        .build());
        analysis.updateSummary(safeSummary);
        meetingAnalysisRepository.save(analysis);
    }

    private void replaceTasks(Meeting meeting, List<SummaryRspDto.TaskDto> tasks) {
        meetingTaskRepository.deleteAllByMeetingMeetingId(meeting.getMeetingId());
        List<SummaryRspDto.TaskDto> safeTasks = Optional.ofNullable(tasks).orElse(List.of());

        int taskOrder = 0;
        for (SummaryRspDto.TaskDto taskDto : safeTasks) {
            if (taskDto == null) {
                continue;
            }

            String worker = Optional.ofNullable(taskDto.worker())
                    .map(String::trim)
                    .filter(s -> !s.isBlank())
                    .orElse("담당 미지정");
            String task = Optional.ofNullable(taskDto.task()).orElse("").trim();
            if (task.isBlank()) {
                continue;
            }

            MeetingTask entity = MeetingTask.builder()
                    .meeting(meeting)
                    .worker(worker)
                    .task(task)
                    .taskOrder(taskOrder++)
                    .build();
            meetingTaskRepository.save(entity);
        }
    }

    private String readSummary(Long meetingId) {
        return meetingAnalysisRepository.findByMeetingMeetingId(meetingId)
                .map(MeetingAnalysis::getSummary)
                .orElse(null);
    }

    private List<AnalysisTaskDto> readAnalysisTasks(Long meetingId) {
        return meetingTaskRepository.findAllByMeetingMeetingIdOrderByTaskOrderAscTaskIdAsc(meetingId)
                .stream()
                .map(task -> new AnalysisTaskDto(
                        Optional.ofNullable(task.getWorker()).orElse("Unknown"),
                        Optional.ofNullable(task.getTask()).orElse("")
                ))
                .toList();
    }

    private String buildTranscript(List<TranscriptSegmentDto> segments) {
        if (segments == null || segments.isEmpty()) {
            return "";
        }

        return segments.stream()
                .filter(Objects::nonNull)
                .filter(seg -> seg.text() != null && !seg.text().isBlank())
                .map(seg -> Optional.ofNullable(seg.speaker()).orElse("SPEAKER_UNKNOWN") + ": " + seg.text())
                .collect(Collectors.joining("\n"));
    }

    private double resolveSeconds(Double seconds, Double millis) {
        if (millis != null) {
            return Math.max(0.0, millis / 1000.0);
        }
        if (seconds == null) {
            return 0.0;
        }
        return Math.max(0.0, seconds);
    }

    private String normalizeSpeaker(String speaker) {
        return Optional.ofNullable(speaker).orElse("").trim();
    }

    private SummaryRspDto sanitizeSummaryResult(SummaryRspDto result, String sourceText) {
        if (result == null) {
            return buildFallbackSummary(sourceText);
        }

        String summary = Optional.ofNullable(result.summary())
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .orElseGet(() -> buildFallbackSummary(sourceText).summary());

        List<SummaryRspDto.TaskDto> tasks = Optional.ofNullable(result.tasks()).orElse(List.of());
        if (tasks.isEmpty()) {
            tasks = buildFallbackSummary(sourceText).tasks();
        }

        return new SummaryRspDto(summary, tasks);
    }

    private SummaryRspDto buildFallbackSummary(String text) {
        String normalized = Optional.ofNullable(text).orElse("").trim();
        String summary = normalized.length() > 300 ? normalized.substring(0, 300) + "..." : normalized;

        Map<String, StringBuilder> grouped = new LinkedHashMap<>();
        for (String line : normalized.split("\\R")) {
            Matcher matcher = SPEAKER_LINE_PATTERN.matcher(line);
            if (!matcher.matches()) {
                continue;
            }

            String worker = matcher.group(1).trim();
            String task = matcher.group(2).trim();
            if (worker.isBlank() || task.isBlank()) {
                continue;
            }

            grouped.computeIfAbsent(worker, k -> new StringBuilder());
            StringBuilder sb = grouped.get(worker);
            if (sb.length() > 0) {
                sb.append(", ");
            }
            sb.append(task);
        }

        List<SummaryRspDto.TaskDto> tasks = grouped.entrySet()
                .stream()
                .map(e -> new SummaryRspDto.TaskDto(e.getKey(), e.getValue().toString()))
                .toList();

        return new SummaryRspDto(summary.isBlank() ? "(요약 없음)" : summary, tasks);
    }

    private void triggerAiBatchDiarize(
            Long meetingId,
            MultipartFile audio,
            String language,
            Integer minSpeakers,
            Integer maxSpeakers
    ) {
        String url = aiServerBaseUrl + "/stt/batch-diarize";

        ByteArrayResource resource;
        try {
            resource = new ByteArrayResource(audio.getBytes()) {
                @Override
                public String getFilename() {
                    return Optional.ofNullable(audio.getOriginalFilename()).orElse("meeting-audio.webm");
                }
            };
        }
        catch (IOException e) {
            throw new RuntimeException("Failed to prepare AI request", e);
        }

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("meeting_id", String.valueOf(meetingId));
        body.add("language", Optional.ofNullable(language).orElse("ko"));
        body.add("min_speakers", String.valueOf(Optional.ofNullable(minSpeakers).orElse(3)));
        body.add("max_speakers", String.valueOf(Optional.ofNullable(maxSpeakers).orElse(4)));
        body.add("audio", resource);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        HttpEntity<MultiValueMap<String, Object>> request = new HttpEntity<>(body, headers);

        try {
            restTemplate.postForEntity(url, request, String.class);
        }
        catch (Exception e) {
            Meeting meeting = meetingRepository.findById(meetingId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_MEETING));
            meeting.updateStatus(Status.FAILED);
            meetingRepository.save(meeting);
        }
    }
}

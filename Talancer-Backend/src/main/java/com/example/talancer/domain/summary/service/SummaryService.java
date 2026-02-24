package com.example.talancer.domain.summary.service;

import com.example.talancer.common.exception.BusinessException;
import com.example.talancer.common.exception.ErrorCode;
import com.example.talancer.domain.meeting.entity.Meeting;
import com.example.talancer.domain.meeting.entity.Status;
import com.example.talancer.domain.meeting.repository.MeetingRepository;
import com.example.talancer.domain.summary.dto.SummaryRspDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.genai.Client;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.Content;
import com.google.genai.types.Part;
import jakarta.transaction.Transactional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

@Service
@Slf4j
public class SummaryService {
    private final Client client;
    private final ObjectMapper objectMapper;
    private final MeetingRepository meetingRepository;

    public SummaryService(@Value("${gemini.key}") String apiKey, ObjectMapper objectMapper, MeetingRepository meetingRepository) {
        this.client = Client.builder().apiKey(apiKey).build();
        this.objectMapper = objectMapper;
        this.meetingRepository = meetingRepository;
    }

    public SummaryRspDto processTextFile(MultipartFile file) throws IOException {
        String fileContent = new String(file.getBytes(), StandardCharsets.UTF_8);
        return callAi(fileContent);
    }

    public SummaryRspDto processRawText(String text) {
        return callAi(text);
    }

    @Transactional
    public SummaryRspDto summaryText(String jsonPayload) {
        try {
            JsonNode rootNode = objectMapper.readTree(jsonPayload);

            Long meetingId = rootNode.path("meetingId").asLong(rootNode.path("meeting_id").asLong(0L));
            String fullText = rootNode.path("text").asText(rootNode.path("fullText").asText(""));
            if (meetingId == null || meetingId <= 0) {
                throw new BusinessException(ErrorCode.JSON_PARSING_ERROR);
            }

            log.info("회의 ID {} 요약 분석 시작 - 텍스트 길이: {}", meetingId, fullText.length());

            SummaryRspDto summaryResult = callAi(fullText);

            Meeting meeting = meetingRepository.findById(meetingId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_MEETING));

            meeting.updateStatus(Status.COMPLETED);

            return summaryResult;

        }
        catch (Exception e) {
            log.error("요약 JSON 파싱 또는 처리 중 에러: {}", e.getMessage());
            throw new BusinessException(ErrorCode.JSON_PARSING_ERROR);
        }
    }

    private SummaryRspDto callAi(String content) {
        log.info("AI 분석 시작 - 길이: {}", content.length());

        String systemPrompt = """
            너는 프로젝트의 유능한 업무 비서야.
            제공된 회의록을 분석하여 다음 규칙에 따라 JSON으로 응답해줘.
            
            1. summary: 회의 전체 내용을 비즈니스 문체로 3줄 이내 요약.
            2. tasks: 인물별로 중복 없이 업무를 통합하여 리스트화.
               - worker: 인물 이름 (중복 제거)
               - task: 해당 인물이 맡은 모든 업무를 콤마(,)로 구분하여 한 줄의 문자열로 나열.
            
            응답은 반드시 아래의 순수 JSON 구조여야 해:
            {
              "summary": "전체 요약 내용",
              "tasks": [
                { "worker": "이름", "task": "업무1, 업무2, 업무3" }
              ]
            }
            """;

        try {
            var response = client.models.generateContent(
                    "gemini-2.5-flash",
                    Content.builder()
                            .role("user")
                            .parts(List.of(
                                    Part.builder().text(systemPrompt).build(),
                                    Part.builder().text(content).build()
                            ))
                            .build(),
                    GenerateContentConfig.builder()
                            .responseMimeType("application/json")
                            .build()
            );

            String jsonResponse = Optional.ofNullable(response.text()).orElse("");
            return parseAiResponse(jsonResponse);

        }
        catch (Exception e) {
            log.error("=== AI 상세 에러 발생 ===");
            log.error("에러 타입: {}", e.getClass().getName());
            log.error("에러 메시지: {}", e.getMessage());
            e.printStackTrace();
            throw new RuntimeException("AI 분석에 실패했습니다.");
        }
    }

    private SummaryRspDto parseAiResponse(String rawText) {
        String fallbackSummary = Optional.ofNullable(rawText).orElse("").trim();
        if (fallbackSummary.isBlank()) {
            return new SummaryRspDto(null, List.of());
        }

        List<String> candidates = new ArrayList<>();
        candidates.add(fallbackSummary);

        String withoutFence = stripCodeFence(fallbackSummary);
        if (!withoutFence.equals(fallbackSummary)) {
            candidates.add(withoutFence);
        }

        String objectOnly = extractJsonObject(withoutFence);
        if (!objectOnly.isBlank() && candidates.stream().noneMatch(objectOnly::equals)) {
            candidates.add(objectOnly);
        }

        for (String candidate : candidates) {
            try {
                SummaryRspDto parsed = objectMapper.readValue(candidate, SummaryRspDto.class);
                return normalizeSummary(parsed, fallbackSummary);
            }
            catch (Exception ignored) {
            }

            try {
                JsonNode node = objectMapper.readTree(candidate);
                return normalizeSummary(toSummaryRspDto(node), fallbackSummary);
            }
            catch (Exception ignored) {
            }
        }

        return new SummaryRspDto(fallbackSummary, List.of());
    }

    private SummaryRspDto toSummaryRspDto(JsonNode node) {
        if (node == null || node.isNull()) {
            return new SummaryRspDto(null, List.of());
        }

        if (node.isArray()) {
            return new SummaryRspDto(null, parseTasksNode(node));
        }

        if (!node.isObject()) {
            return new SummaryRspDto(node.asText(""), List.of());
        }

        String summary = readNonEmptyText(node, "summary", "result", "text", "overview", "fullText");

        JsonNode taskNode = null;
        for (String key : List.of("tasks", "taskList", "todos", "todo", "actionItems", "actions")) {
            if (node.has(key)) {
                taskNode = node.get(key);
                break;
            }
        }

        List<SummaryRspDto.TaskDto> tasks = parseTasksNode(taskNode);
        return new SummaryRspDto(summary, tasks);
    }

    private List<SummaryRspDto.TaskDto> parseTasksNode(JsonNode taskNode) {
        if (taskNode == null || taskNode.isNull()) {
            return List.of();
        }

        List<SummaryRspDto.TaskDto> tasks = new ArrayList<>();

        if (taskNode.isArray()) {
            for (JsonNode item : taskNode) {
                if (item == null || item.isNull()) {
                    continue;
                }

                if (item.isTextual()) {
                    String text = item.asText("").trim();
                    if (!text.isBlank()) {
                        tasks.add(new SummaryRspDto.TaskDto("담당 미지정", text));
                    }
                    continue;
                }

                String worker = readNonEmptyText(item, "worker", "owner", "assignee", "name");
                String task = readNonEmptyText(item, "task", "todo", "content", "description", "work");
                if (task.isBlank() && item.has("tasks")) {
                    task = normalizeTaskText(item.get("tasks"));
                }

                if (task.isBlank()) {
                    continue;
                }

                tasks.add(
                        new SummaryRspDto.TaskDto(
                                worker.isBlank() ? "담당 미지정" : worker,
                                task
                        )
                );
            }
            return tasks;
        }

        if (taskNode.isObject()) {
            boolean hasStructuredFields = taskNode.has("worker") || taskNode.has("task");
            if (hasStructuredFields) {
                String worker = readNonEmptyText(taskNode, "worker", "owner", "assignee", "name");
                String task = readNonEmptyText(taskNode, "task", "todo", "content", "description", "work");
                if (!task.isBlank()) {
                    tasks.add(new SummaryRspDto.TaskDto(worker.isBlank() ? "담당 미지정" : worker, task));
                }
                return tasks;
            }

            for (Map.Entry<String, JsonNode> entry : iterable(taskNode.fields())) {
                String worker = Optional.ofNullable(entry.getKey()).orElse("").trim();
                String task = normalizeTaskText(entry.getValue());
                if (task.isBlank()) {
                    continue;
                }
                tasks.add(new SummaryRspDto.TaskDto(worker.isBlank() ? "담당 미지정" : worker, task));
            }
        }

        return tasks;
    }

    private SummaryRspDto normalizeSummary(SummaryRspDto dto, String fallbackSummary) {
        if (dto == null) {
            return new SummaryRspDto(fallbackSummary, List.of());
        }

        String summary = Optional.ofNullable(dto.summary())
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .orElse(fallbackSummary);

        List<SummaryRspDto.TaskDto> tasks = Optional.ofNullable(dto.tasks())
                .orElse(List.of())
                .stream()
                .filter(Objects::nonNull)
                .map(t -> new SummaryRspDto.TaskDto(
                        Optional.ofNullable(t.worker()).orElse("담당 미지정").trim(),
                        Optional.ofNullable(t.task()).orElse("").trim()
                ))
                .filter(t -> !t.task().isBlank())
                .toList();

        return new SummaryRspDto(summary, tasks);
    }

    private String readNonEmptyText(JsonNode node, String... keys) {
        if (node == null || node.isNull()) {
            return "";
        }
        for (String key : keys) {
            JsonNode value = node.get(key);
            if (value == null || value.isNull()) {
                continue;
            }
            String text = normalizeTaskText(value);
            if (!text.isBlank()) {
                return text;
            }
        }
        return "";
    }

    private String normalizeTaskText(JsonNode node) {
        if (node == null || node.isNull()) {
            return "";
        }
        if (node.isTextual()) {
            return node.asText("").trim();
        }
        if (node.isArray()) {
            List<String> parts = new ArrayList<>();
            for (JsonNode item : node) {
                String part = normalizeTaskText(item);
                if (!part.isBlank()) {
                    parts.add(part);
                }
            }
            return String.join(", ", parts);
        }
        if (node.isObject()) {
            return readNonEmptyText(node, "task", "todo", "content", "description", "text");
        }
        return node.asText("").trim();
    }

    private String stripCodeFence(String value) {
        String text = Optional.ofNullable(value).orElse("").trim();
        if (!text.startsWith("```")) {
            return text;
        }
        text = text.replaceFirst("^```(?:json)?\\s*", "");
        text = text.replaceFirst("\\s*```$", "");
        return text.trim();
    }

    private String extractJsonObject(String value) {
        String text = Optional.ofNullable(value).orElse("").trim();
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end <= start) {
            return "";
        }
        return text.substring(start, end + 1).trim();
    }

    private <T> Iterable<T> iterable(java.util.Iterator<T> iterator) {
        return () -> iterator;
    }
}

package com.example.talancer.domain.stt.controller;

import com.example.talancer.common.RspTemplate;
import com.example.talancer.domain.stt.dto.*;
import com.example.talancer.domain.stt.service.SttService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping({"/stt", "/api/stt"})
@RequiredArgsConstructor
public class SttController {
    private final SttService sttService;

    @PostMapping("/meetings/{meetingId}/process")
    public ResponseEntity<SttProcessResponse> process(
            @PathVariable Long meetingId,
            @RequestPart("audio") MultipartFile audio,
            @RequestParam(value = "language", required = false, defaultValue = "ko") String language,
            @RequestParam(value = "min_speakers", required = false, defaultValue = "3") Integer minSpeakers,
            @RequestParam(value = "max_speakers", required = false, defaultValue = "4") Integer maxSpeakers
    ) {
        return ResponseEntity.accepted()
                .body(sttService.processMeetingAudio(meetingId, audio, language, minSpeakers, maxSpeakers));
    }

    @PostMapping("/batch")
    public RspTemplate<String> onBatch(@RequestBody AiBatchPayload payload) {
        sttService.handleBatch(payload);
        return new RspTemplate<>(HttpStatus.OK, "STT batch callback saved");
    }

    @PostMapping("/batch-diarize")
    public RspTemplate<String> onBatchDiarize(@RequestBody AiBatchDiarizePayload payload) {
        sttService.handleBatchDiarize(payload);
        return new RspTemplate<>(HttpStatus.OK, "STT diarize callback saved");
    }

    @GetMapping("/meetings/{meetingId}/transcript")
    public ResponseEntity<TranscriptResponse> getTranscript(@PathVariable Long meetingId) {
        return ResponseEntity.ok(sttService.getTranscript(meetingId));
    }

    @PatchMapping("/meetings/{meetingId}/speakers")
    public ResponseEntity<SpeakerUpdateResponse> updateSpeakers(
            @PathVariable Long meetingId,
            @RequestBody SpeakerUpdateRequest request
    ) {
        return ResponseEntity.ok(sttService.updateSpeakers(meetingId, request));
    }

    @GetMapping("/meetings/{meetingId}/audio")
    public ResponseEntity<byte[]> getAudio(
            @PathVariable Long meetingId,
            @RequestParam(value = "download", defaultValue = "false") boolean download
    ) {
        return sttService.getMeetingAudio(meetingId, download);
    }
}

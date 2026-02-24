package com.example.talancer.domain.meeting.controller;

import com.example.talancer.domain.meeting.dto.*;
import com.example.talancer.domain.meeting.service.MeetingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/meetings")
@RequiredArgsConstructor
@Tag(name = "회의 관리")
public class MeetingController {
    private final MeetingService meetingService;

    @Operation(summary = "새 회의 생성")
    @PostMapping
    public ResponseEntity<MeetingRspDto> create(@RequestBody MeetingReqDto req) {
        return ResponseEntity.ok(meetingService.createMeeting(req));
    }

    @Operation(summary = "회의 한 개 조회")
    @GetMapping("/{id}")
    public ResponseEntity<MeetingRspDto> get(@PathVariable Long id) {
        return ResponseEntity.ok(meetingService.getMeeting(id));
    }

    @Operation(summary = "회의 전체 조회")
    @GetMapping
    public ResponseEntity<List<MeetingRspDto>> getAll() {
        return ResponseEntity.ok(meetingService.getAllMeetings());
    }

    @Operation(summary = "회의 요약/할일 조회")
    @GetMapping("/{id}/analysis")
    public ResponseEntity<MeetingAnalysisRspDto> getAnalysis(@PathVariable Long id) {
        return ResponseEntity.ok(meetingService.getMeetingAnalysis(id));
    }

    @Operation(summary = "회의 요약/할일 다운로드")
    @GetMapping("/{id}/analysis/download")
    public ResponseEntity<byte[]> downloadAnalysis(@PathVariable Long id) {
        String text = meetingService.buildMeetingAnalysisText(id);
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(new MediaType("text", "plain", StandardCharsets.UTF_8));
        headers.setContentLength(bytes.length);
        headers.setContentDisposition(
                ContentDisposition.attachment()
                        .filename("meeting-" + id + "-analysis.txt", StandardCharsets.UTF_8)
                        .build()
        );

        return ResponseEntity.ok().headers(headers).body(bytes);
    }

    @Operation(summary = "회의 삭제")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        meetingService.deleteMeeting(id);
        return ResponseEntity.noContent().build();
    }
}

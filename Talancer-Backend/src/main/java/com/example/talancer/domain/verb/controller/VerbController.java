package com.example.talancer.domain.verb.controller;

import com.example.talancer.common.RspTemplate;
import com.example.talancer.domain.summary.service.SummaryService;
import com.example.talancer.domain.verb.service.VerbService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/verb/stt")
@RequiredArgsConstructor
@Tag(name = "음성 텍스트 관리")
public class VerbController {
    private final SummaryService summaryService;
    private final VerbService verbService;

    @Operation(summary = "전체 음성 텍스트 요약 및 업무 분배")
    @PostMapping("/batch")
    public RspTemplate<String> summaryText(@RequestBody String jsonPayload) {
        summaryService.summaryText(jsonPayload);
        return new RspTemplate<>(HttpStatus.OK, "요약 및 업무 분배가 완료되었습니다.");
    }

    @Operation(summary = "화자 분리 DB 저장")
    @PostMapping("/diarize")
    public RspTemplate<Void> handleAiResult(@RequestBody String jsonPayload) {
        verbService.saveAnalyzedVerbs(jsonPayload);
        return new RspTemplate<>(HttpStatus.OK, "발화 데이터 저장이 완료되었습니다.");
    }
}
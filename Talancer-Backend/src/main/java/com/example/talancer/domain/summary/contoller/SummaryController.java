package com.example.talancer.domain.summary.contoller;

import com.example.talancer.domain.summary.dto.SummaryRspDto;
import com.example.talancer.domain.summary.service.SummaryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@Tag(name = "업무 분배 및 요약")
@RestController
@RequestMapping("/ai")
@RequiredArgsConstructor
public class SummaryController {
    private final SummaryService summaryService;

    @Operation(summary = "파일 기반 요약", description = ".txt 파일을 업로드하면 요약 결과와 업무 리스트를 반환")
    @PostMapping(value = "/summarize/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<SummaryRspDto> summarizeFile(@RequestPart("file") MultipartFile file) {
        try {
            return ResponseEntity.ok(summaryService.processTextFile(file));
        }
        catch (IOException e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @Operation(summary = "텍스트 기반 분석")
    @PostMapping("/summarize/text")
    public ResponseEntity<SummaryRspDto> summarizeText(@RequestBody String content) {
        // 입력값이 비어있는지 체크
        if (content == null || content.isBlank()) return ResponseEntity.badRequest().build();
        return ResponseEntity.ok(summaryService.processRawText(content));
    }
}

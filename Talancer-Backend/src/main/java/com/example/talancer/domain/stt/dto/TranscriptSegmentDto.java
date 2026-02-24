package com.example.talancer.domain.stt.dto;

public record TranscriptSegmentDto(
        Long verbId,
        String speaker,
        Double start,
        Double end,
        String text
) {
}

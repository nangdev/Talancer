package com.example.talancer.domain.stt.dto;

public record SttProcessResponse(
        Long meetingId,
        String status,
        String message
) {
}

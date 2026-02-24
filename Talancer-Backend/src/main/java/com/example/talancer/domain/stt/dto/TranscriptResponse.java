package com.example.talancer.domain.stt.dto;

import com.example.talancer.domain.meeting.entity.Status;

import java.util.List;

public record TranscriptResponse(
        Long meetingId,
        Status status,
        String transcript,
        String summary,
        List<AnalysisTaskDto> tasks,
        String audioUrl,
        String audioDownloadUrl,
        List<TranscriptSegmentDto> segments
) {
}

package com.example.talancer.domain.meeting.dto;

import com.example.talancer.domain.meeting.entity.Status;
import com.example.talancer.domain.stt.dto.AnalysisTaskDto;

import java.time.LocalDateTime;
import java.util.List;

public record MeetingAnalysisRspDto(
        Long meetingId,
        String title,
        Status status,
        String summary,
        List<AnalysisTaskDto> tasks,
        LocalDateTime updateTime
) {
}

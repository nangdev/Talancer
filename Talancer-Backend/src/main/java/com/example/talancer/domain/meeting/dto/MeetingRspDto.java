package com.example.talancer.domain.meeting.dto;

import com.example.talancer.domain.meeting.entity.Status;

import java.time.LocalDateTime;

public record MeetingRspDto (
    Long meetingId,
    String title,
    Status status,
    LocalDateTime startAt,
    LocalDateTime endedAt,
    LocalDateTime updateTime,
    String audioDownloadUrl
) {}

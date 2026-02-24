package com.example.talancer.domain.summary.dto;

import java.util.List;

public record SummaryRspDto(
        String summary,
        List<TaskDto> tasks // 업무 분배 리스트
) {
    public record TaskDto(
            String worker,
            String task
    ) {}
}



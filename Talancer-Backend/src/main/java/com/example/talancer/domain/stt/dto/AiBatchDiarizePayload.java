package com.example.talancer.domain.stt.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record AiBatchDiarizePayload(
        @JsonAlias({"meeting_id", "meetingID"})
        Long meetingId,

        @JsonAlias({"speakerCount", "numSpeakers"})
        Integer speakers,

        @JsonAlias({"full_text", "text", "transcript"})
        String fullText,

        @JsonAlias({"diarizedSegments"})
        List<AiSegmentPayload> segments
) {
}

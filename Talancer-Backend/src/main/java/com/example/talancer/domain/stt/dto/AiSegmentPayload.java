package com.example.talancer.domain.stt.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record AiSegmentPayload(
        @JsonAlias({"speakerLabel", "speaker_name"})
        String speaker,

        @JsonAlias({"start_sec", "startSeconds", "start"})
        Double start,

        @JsonAlias({"end_sec", "endSeconds", "end"})
        Double end,

        @JsonAlias({"startMs"})
        Double startMs,

        @JsonAlias({"endMs"})
        Double endMs,

        @JsonAlias({"transcript", "content"})
        String text
) {
}

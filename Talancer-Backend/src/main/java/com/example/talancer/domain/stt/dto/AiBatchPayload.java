package com.example.talancer.domain.stt.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record AiBatchPayload(
        @JsonAlias({"meeting_id", "meetingID"})
        Long meetingId,

        @JsonAlias({"language"})
        String lang,

        @JsonAlias({"fullText", "full_text", "transcript"})
        String text
) {
}

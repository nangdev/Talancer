package com.example.talancer.domain.stt.dto;

import java.util.List;

public record SpeakerUpdateRequest(
        List<SpeakerRenameDto> renames
) {
}

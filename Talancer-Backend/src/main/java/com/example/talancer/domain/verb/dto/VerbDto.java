package com.example.talancer.domain.verb.dto;

public record VerbDto(
        String speaker,
        Double start,
        Double end,
        String text
) {}

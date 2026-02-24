package com.example.talancer.domain.user.dto;

public record UserMeRspDto(
        Long userId,
        String loginId,
        String name,
        String role
) {
}

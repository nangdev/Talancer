package com.example.talancer.domain.user.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Getter;

@Getter
public class LoginReqDto {
    @Schema(name = "loginId", example = "testId")
    private String loginId;

    @Schema(name = "password", example = "0000")
    private String password;
}

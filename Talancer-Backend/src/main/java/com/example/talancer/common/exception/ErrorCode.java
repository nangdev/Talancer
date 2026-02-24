package com.example.talancer.common.exception;

import lombok.Getter;

@Getter
public enum ErrorCode {
    // 로그인
    ALREADY_USER(500, "이미 가입된 로그인 아이디입니다."),
    NOT_FOUND_USER(404, "유저를 찾을 수 없습니다."),
    INCORRECT_PASSWORD(500, "비밀번호가 올바르지 않습니다."),

    // 회의
    NOT_FOUND_MEETING(404, "회의를 찾을 수 없습니다."),

    // 기타
    JSON_PARSING_ERROR(500, "JSON 파싱 중 오류가 발생했습니다."),
    ;

    private final int code;
    private final String message;

    ErrorCode(int code, String message) {
        this.code = code;
        this.message = message;
    }
}
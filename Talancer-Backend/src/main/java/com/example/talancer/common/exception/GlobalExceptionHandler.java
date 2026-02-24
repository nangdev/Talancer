package com.example.talancer.common.exception;

import com.example.talancer.common.util.LoggingUtil;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {
    // BingException 발생 시 (유효성 검사)
    @ExceptionHandler(BindException.class)
    public ResponseEntity<ErrorRspDto<Map<String, String>>> handleBindException(BindException e, HttpServletRequest request) {
        printLog(e, request);

        List<FieldError> fieldErrors = e.getBindingResult().getFieldErrors();   // 오류 목록 가져오기

        StringBuilder sb = new StringBuilder();
        Map<String, String> errorInfoMap = new HashMap<>();

        // 오류를 추출해서 메시지 담기
        for (FieldError fieldError: fieldErrors) {
            String errorMsg = sb
                    .append(fieldError.getDefaultMessage())
                    .append(". 요청받은 값: ")
                    .append(fieldError.getRejectedValue())
                    .toString();

            errorInfoMap.put(fieldError.getField(), errorMsg);

            sb.setLength(0);
        }

        // 에러 전송 (400 에러)
        return createErrorResponse(HttpStatus.BAD_REQUEST.value(), HttpStatus.BAD_REQUEST, errorInfoMap);
    }

    // 일반적인 런타임 예외 처리
    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class, NoSuchElementException.class})
    public ResponseEntity<ErrorRspDto<String>> handleBusinessException(RuntimeException e, HttpServletRequest request){
        printLog(e, request);
        return createErrorResponse(HttpStatus.BAD_REQUEST.value(), HttpStatus.BAD_REQUEST, e.getMessage());
    }

    // BusinessException을 상속한 다른 CustomException에도 적용
    @ExceptionHandler({BusinessException.class})
    public ResponseEntity<ErrorRspDto<String>> handleBusinessException(BusinessException e, HttpServletRequest request){
        printLog(e, request);
        return createErrorResponse(e.getCode(), e.getHttpStatus(), e.getMessage());
    }

    // 정적 리소스/경로 미존재는 404로 처리
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ErrorRspDto<String>> handleNoResourceFoundException(
            NoResourceFoundException e, HttpServletRequest request
    ) {
        log.warn("요청한 리소스를 찾을 수 없음. 요청 Method: {}, 요청 url: {}, 메시지: {}",
                request.getMethod(), request.getRequestURI(), e.getMessage());
        return createErrorResponse(
                HttpStatus.NOT_FOUND.value(),
                HttpStatus.NOT_FOUND,
                "요청한 리소스를 찾을 수 없습니다."
        );
    }

    // 예상하지 못한 예외 발생 시 500 에러와 함께 기본 에러 메시지 넘기기
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorRspDto<String>> handleException(Exception e, HttpServletRequest request){
        HttpStatus httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
        log.error("예외 처리 범위 외의 오류 발생");
        printLog(e, request);
        String fullStackTrace = LoggingUtil.stackTraceToString(e);

        return createErrorResponse(httpStatus.value(), httpStatus, e.getMessage() +", " + fullStackTrace);
    }

    // 응답 생성 메소드
    private <T> ResponseEntity<ErrorRspDto<T>> createErrorResponse(int statusCode, HttpStatus httpStatus, T errorMessage) {
        ErrorRspDto<T> errDto = new ErrorRspDto<>(statusCode, httpStatus, errorMessage);
        MediaType jsonUtf8 = new MediaType("application", "json", StandardCharsets.UTF_8);
        return ResponseEntity.status(httpStatus)
                .contentType(jsonUtf8)
                .body(errDto);
    }

    // 예외 출력
    private void printLog(Exception e, HttpServletRequest request) {
        log.error("발생 예외: {}, 에러 메시지: {}, 요청 Method: {}, 요청 url: {}",
                e.getClass().getSimpleName(), e.getMessage(), request.getMethod(), request.getRequestURI(), e);
    }
}

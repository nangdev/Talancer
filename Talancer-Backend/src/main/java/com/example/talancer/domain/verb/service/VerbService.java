package com.example.talancer.domain.verb.service;

import com.example.talancer.common.exception.BusinessException;
import com.example.talancer.common.exception.ErrorCode;
import com.example.talancer.domain.meeting.entity.Meeting;
import com.example.talancer.domain.meeting.repository.MeetingRepository;
import com.example.talancer.domain.verb.dto.VerbDto;
import com.example.talancer.domain.verb.entity.Verb;
import com.example.talancer.domain.verb.repository.VerbRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class VerbService {
    private final VerbRepository verbRepository;
    private final MeetingRepository meetingRepository;
    private final ObjectMapper objectMapper; // JSON 파싱용

    @Transactional
    public void saveAnalyzedVerbs(String jsonPayload) {
        try {
            JsonNode rootNode = objectMapper.readTree(jsonPayload);

            Long meetingId = rootNode.get("meetingId").asLong();

            // 필드에 맞게 수정 필요
            JsonNode textsNode = rootNode.get("texts");
            List<VerbDto> verbDtos = objectMapper.convertValue(textsNode, new TypeReference<List<VerbDto>>() {});

            Meeting meeting = meetingRepository.findById(meetingId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_MEETING));

            List<Verb> verbs = verbDtos.stream()
                    .map(dto -> Verb.builder()
                            .speaker(dto.speaker())
                            .start(dto.start())
                            .end(dto.end())
                            .text(dto.text())
                            .meeting(meeting)
                            .build())
                    .collect(Collectors.toList());

            verbRepository.saveAll(verbs);
            log.info("회의 ID {} - 발화 데이터 {}건 파싱 및 저장 완료", meetingId, verbs.size());

        }
        catch (Exception e) {
            log.error("JSON 파싱 중 에러 발생: {}", e.getMessage());
            throw new BusinessException(ErrorCode.JSON_PARSING_ERROR);
        }
    }
}
package com.example.talancer.domain.meeting.service;

import com.example.talancer.common.exception.BusinessException;
import com.example.talancer.common.exception.ErrorCode;
import com.example.talancer.common.util.SecurityUtil;
import com.example.talancer.domain.meeting.dto.MeetingAnalysisRspDto;
import com.example.talancer.domain.meeting.dto.MeetingReqDto;
import com.example.talancer.domain.meeting.dto.MeetingRspDto;
import com.example.talancer.domain.meeting.entity.MeetingAnalysis;
import com.example.talancer.domain.meeting.entity.Meeting;
import com.example.talancer.domain.meeting.entity.MeetingTask;
import com.example.talancer.domain.meeting.entity.Status;
import com.example.talancer.domain.meeting.repository.MeetingAnalysisRepository;
import com.example.talancer.domain.meeting.repository.MeetingRepository;
import com.example.talancer.domain.meeting.repository.MeetingTaskRepository;
import com.example.talancer.domain.stt.dto.AnalysisTaskDto;
import com.example.talancer.domain.user.entity.User;
import com.example.talancer.domain.user.repository.UserRepository;
import com.example.talancer.domain.verb.repository.VerbRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MeetingService {

    private final MeetingRepository meetingRepository;
    private final MeetingAnalysisRepository meetingAnalysisRepository;
    private final MeetingTaskRepository meetingTaskRepository;
    private final UserRepository userRepository;
    private final VerbRepository verbRepository;

    @Transactional
    public MeetingRspDto createMeeting(MeetingReqDto req) {
        User currentUser = getCurrentUser();

        Meeting meeting = Meeting.builder()
                .title(req.title())
                .startAt(LocalDateTime.now())
                .status(Status.CREATED)
                .user(currentUser)
                .build();

        Meeting savedMeeting = meetingRepository.save(meeting);
        return convertToRes(savedMeeting);
    }

    public MeetingRspDto getMeeting(Long id) {
        User currentUser = getCurrentUser();
        Meeting meeting = getOwnedMeeting(id, currentUser.getUserId());
        return convertToRes(meeting);
    }

    public List<MeetingRspDto> getAllMeetings() {
        User currentUser = getCurrentUser();

        return meetingRepository.findAllByUserUserIdOrderByUpdateTimeDesc(currentUser.getUserId())
                .stream()
                .map(this::convertToRes)
                .toList();
    }

    public MeetingAnalysisRspDto getMeetingAnalysis(Long id) {
        User currentUser = getCurrentUser();
        Meeting meeting = getOwnedMeeting(id, currentUser.getUserId());
        String summary = meetingAnalysisRepository.findByMeetingMeetingId(meeting.getMeetingId())
                .map(MeetingAnalysis::getSummary)
                .orElse(null);
        List<AnalysisTaskDto> tasks = meetingTaskRepository.findAllByMeetingMeetingIdOrderByTaskOrderAscTaskIdAsc(meeting.getMeetingId())
                .stream()
                .map(this::toTaskDto)
                .toList();

        return new MeetingAnalysisRspDto(
                meeting.getMeetingId(),
                meeting.getTitle(),
                meeting.getStatus(),
                summary,
                tasks,
                meeting.getUpdateTime()
        );
    }

    public String buildMeetingAnalysisText(Long id) {
        MeetingAnalysisRspDto analysis = getMeetingAnalysis(id);

        StringBuilder sb = new StringBuilder();
        sb.append("Meeting: ").append(Optional.ofNullable(analysis.title()).orElse("Untitled Meeting")).append('\n');
        sb.append("Status: ").append(analysis.status()).append('\n');
        sb.append("Updated At: ").append(analysis.updateTime()).append('\n');
        sb.append('\n');
        sb.append("[Summary]").append('\n');
        sb.append(Optional.ofNullable(analysis.summary()).filter(s -> !s.isBlank()).orElse("(empty)")).append('\n');
        sb.append('\n');
        sb.append("[Tasks]").append('\n');

        List<AnalysisTaskDto> tasks = analysis.tasks();
        if (tasks == null || tasks.isEmpty()) {
            sb.append("- (none)").append('\n');
        } else {
            for (int i = 0; i < tasks.size(); i++) {
                AnalysisTaskDto task = tasks.get(i);
                sb.append(i + 1)
                        .append(". ")
                        .append(Optional.ofNullable(task.worker()).orElse("Unknown"))
                        .append(": ")
                        .append(Optional.ofNullable(task.task()).orElse(""))
                        .append('\n');
            }
        }

        return sb.toString();
    }

    @Transactional
    public void deleteMeeting(Long id) {
        User currentUser = getCurrentUser();
        Meeting meeting = getOwnedMeeting(id, currentUser.getUserId());

        meetingTaskRepository.deleteAllByMeetingMeetingId(meeting.getMeetingId());
        meetingAnalysisRepository.deleteByMeetingMeetingId(meeting.getMeetingId());
        verbRepository.deleteAllByMeetingMeetingId(meeting.getMeetingId());
        meetingRepository.delete(meeting);
    }

    private User getCurrentUser() {
        String loginId = SecurityUtil.getCurrentLoginId();
        return userRepository.findByLoginId(loginId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_USER));
    }

    private Meeting getOwnedMeeting(Long meetingId, Long userId) {
        return meetingRepository.findByMeetingIdAndUserUserId(meetingId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_MEETING));
    }

    private MeetingRspDto convertToRes(Meeting meeting) {
        return new MeetingRspDto(
                meeting.getMeetingId(),
                meeting.getTitle(),
                meeting.getStatus(),
                meeting.getStartAt(),
                meeting.getEndedAt(),
                meeting.getUpdateTime(),
                meeting.getAudioObjectKey() == null
                        ? null
                        : "/api/stt/meetings/" + meeting.getMeetingId() + "/audio?download=true"
        );
    }

    private AnalysisTaskDto toTaskDto(MeetingTask task) {
        return new AnalysisTaskDto(
                Optional.ofNullable(task.getWorker()).orElse("Unknown"),
                Optional.ofNullable(task.getTask()).orElse("")
        );
    }
}

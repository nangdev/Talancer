package com.example.talancer.domain.meeting.repository;

import com.example.talancer.domain.meeting.entity.MeetingTask;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MeetingTaskRepository extends JpaRepository<MeetingTask, Long> {
    List<MeetingTask> findAllByMeetingMeetingIdOrderByTaskOrderAscTaskIdAsc(Long meetingId);
    void deleteAllByMeetingMeetingId(Long meetingId);
}

package com.example.talancer.domain.meeting.repository;

import com.example.talancer.domain.meeting.entity.MeetingAnalysis;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MeetingAnalysisRepository extends JpaRepository<MeetingAnalysis, Long> {
    Optional<MeetingAnalysis> findByMeetingMeetingId(Long meetingId);
    void deleteByMeetingMeetingId(Long meetingId);
}

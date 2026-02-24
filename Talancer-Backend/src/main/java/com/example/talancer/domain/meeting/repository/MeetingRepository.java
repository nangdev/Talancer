package com.example.talancer.domain.meeting.repository;

import com.example.talancer.domain.meeting.entity.Meeting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MeetingRepository extends JpaRepository<Meeting, Long> {
    List<Meeting> findAllByUserUserIdOrderByUpdateTimeDesc(Long userId);

    Optional<Meeting> findByMeetingIdAndUserUserId(Long meetingId, Long userId);
}

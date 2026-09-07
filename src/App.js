import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, Link } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, push, remove, update } from 'firebase/database';

// 1. Firebase 연동 설정
const firebaseConfig = {
  apiKey: "AIzaSyDdG6a0_-Rd_SQI4mkMXv4zlamlX7McQBk",
  authDomain: "music-meeting.firebaseapp.com",
  databaseURL: "https://music-meeting-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "music-meeting",
  storageBucket: "music-meeting.firebasestorage.app",
  messagingSenderId: "395458794899",
  appId: "1:395458794899:web:74d7b3d5acbe4b742d4466"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const SONG_SESSION_TYPES = ['보컬', '드럼', '베이스', '리드기타', '백킹기타', '키보드1', '키보드2'];
const MEMBER_PART_TYPES = ['보컬', '드럼', '베이스', '기타', '키보드'];

// --- [공통] 로그 생성 헬퍼 함수 ---
const logActivity = (currentUser, actionText) => {
  const logsRef = ref(db, 'logs');
  const newLogRef = push(logsRef);
  const now = new Date();
  const timeString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  set(newLogRef, {
    timestamp: timeString,
    adminId: currentUser.id,
    adminName: currentUser.name,
    action: actionText
  });
};

// --- [공통] '미정' 세션 개수로 잔여 인원 계산 ---
const calculateUnassignedSessions = (sessions) => {
  if (!sessions) return 0;
  let unassignedCount = 0;
  Object.values(sessions).forEach(session => {
    const assignedCount = session.assignedMembers ? Object.keys(session.assignedMembers).length : 0;
    if (assignedCount === 0) {
      unassignedCount += 1;
    }
  });
  return unassignedCount;
};

// --- [공통] 세션 표기 라벨 생성 함수 ---
const formatSessionLabel = (session) => {
  const details = [];
  if (session.detailName && session.detailName.trim()) {
    details.push(session.detailName.trim());
  }
  if (session.difficulty && session.difficulty.trim()) {
    details.push(session.difficulty.trim());
  }

  if (details.length > 0) {
    return `${session.sessionName}(${details.join('-')})`;
  }
  return session.sessionName;
};

// --- [공통] 지망 순위 정렬 및 신청자/보류 강조 표시 ---
const renderAssignedMembers = (assignedMembers, members) => {
  if (!assignedMembers || Object.keys(assignedMembers).length === 0) {
    return <span className="text-gray-400 italic">미정</span>;
  }

  const list = Object.entries(assignedMembers).map(([mId, detail]) => {
    const m = members[mId];
    return {
      id: mId,
      name: m ? m.name : '알수없음',
      generation: m ? m.generation : '',
      rank: detail.rank ? Number(detail.rank) : 999,
      isRequester: detail.isRequester || false,
      isPending: detail.isPending || false
    };
  });

  list.sort((a, b) => a.rank - b.rank);

  return (
    <span>
      {list.map((item, index) => {
        const rankText = item.rank !== 999 ? `(${item.rank})` : '';

        if (item.isPending) {
          return (
            <React.Fragment key={item.id}>
              {index > 0 && ', '}
              <span className="text-amber-600 font-bold bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                {item.name}{rankText} (보류)
              </span>
            </React.Fragment>
          );
        }

        if (item.isRequester) {
          return (
            <React.Fragment key={item.id}>
              {index > 0 && ', '}
              <span className="text-blue-600 font-bold bg-blue-50 px-1 py-0.5 rounded border border-blue-200">
                {item.name}{rankText}
              </span>
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={item.id}>
            {index > 0 && ', '}
            <span>{item.name}{rankText}</span>
          </React.Fragment>
        );
      })}
    </span>
  );
};

// --- [공통 UI] 로딩바 형태의 실시간 곡 완성도 컴포넌트 ---
function ProgressBarStatus({ songs, targetSongCount }) {
  const completedSongs = songs.filter(s => s.isCompleted);
  const completedCount = completedSongs.length;
  const completedTitles = completedSongs.map(s => s.title).join(', ');

  const percentage = targetSongCount > 0 
    ? Math.min(Math.round((completedCount / targetSongCount) * 100), 100) 
    : 0;

  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm space-y-2">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center text-sm gap-1">
        <div className="font-bold text-gray-700 flex items-center gap-1.5 overflow-hidden">
          <span className="shrink-0">🎵</span>
          <span className="shrink-0">곡 완성도:</span>
          <span className="text-gray-600 font-normal truncate">
            {completedTitles ? completedTitles : '없음'}
          </span>
        </div>
        <span className="font-extrabold text-blue-600 shrink-0">
          {completedCount} / {targetSongCount}곡 ({percentage}%)
        </span>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden border p-0.5 relative">
        <div 
          className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
          style={{ width: `${percentage}%` }}
        >
          {percentage >= 15 && (
            <span className="text-[10px] text-white font-bold animate-pulse">
              {percentage}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- [공통 UI] 검색 및 완성/잔여 인원 필터 컴포넌트 ---
function SongFilterBar({ searchTerm, setSearchTerm, filterAvailableOnly, setFilterAvailableOnly, filterCompletedOnly, setFilterCompletedOnly }) {
  return (
    <div className="bg-white p-3 rounded-xl border shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
      <div className="w-full sm:w-72 relative">
        <input 
          type="text" 
          placeholder="곡명, 가수, 학회원 이름 검색..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full border p-2 pl-8 text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <span className="absolute left-2.5 top-2.5 text-xs text-gray-400">🔍</span>
      </div>

      <div className="flex items-center gap-4 self-start sm:self-auto text-xs font-bold text-gray-700 select-none">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input 
            type="checkbox" 
            checked={filterCompletedOnly}
            onChange={e => {
              setFilterCompletedOnly(e.target.checked);
              if (e.target.checked) setFilterAvailableOnly(false);
            }}
            className="rounded text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
          />
          <span>✨ 완성</span>
        </label>

        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input 
            type="checkbox" 
            checked={filterAvailableOnly}
            onChange={e => {
              setFilterAvailableOnly(e.target.checked);
              if (e.target.checked) setFilterCompletedOnly(false);
            }}
            className="rounded text-emerald-600 focus:ring-0 w-4 h-4 cursor-pointer"
          />
          <span>⚡ 잔여</span>
        </label>
      </div>
    </div>
  );
}

// --- [공통] 곡 목록 메인 뷰 ---
function SongListView({ songs, members, showAdminActions = false, onEditSong, onDeleteSong }) {
  const sortedSongs = [...songs].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="space-y-4">
      {/* PC 전용 테이블 뷰 */}
      <div className="hidden md:block overflow-x-auto border rounded-lg shadow-sm bg-white">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-emerald-600 text-white text-sm">
              <th className="p-3 w-28 text-center border-r border-emerald-500">잔여 인원</th>
              <th className="p-3 w-64 border-r border-emerald-500">곡명 - 가수</th>
              <th className="p-3">신청 현황</th>
              {showAdminActions && <th className="p-3 w-40 text-center border-l border-emerald-500">관리</th>}
            </tr>
          </thead>
          <tbody>
            {sortedSongs.length === 0 ? (
              <tr>
                <td colSpan={showAdminActions ? 4 : 3} className="p-8 text-center text-gray-500">검색 조건에 맞는 곡이 없습니다.</td>
              </tr>
            ) : (
              sortedSongs.map((song) => {
                const remaining = calculateUnassignedSessions(song.sessions);
                return (
                  <tr key={song.id} className={`border-b hover:bg-gray-50 ${
                    song.isCompleted ? 'bg-blue-50/30' : song.isDropped ? 'bg-red-50/40' : ''
                  }`}>
                    <td className="p-3 text-center border-r font-medium">
                      {song.isCompleted ? (
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-700 border border-blue-200">
                          완성
                        </span>
                      ) : song.isDropped ? (
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-700 border border-red-200">
                          짤
                        </span>
                      ) : (
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                          remaining > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {remaining}명
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-semibold border-r text-gray-800">
                      {song.title} - {song.artist}
                    </td>
                    <td className="p-3">
                      <div className="space-y-1.5 text-sm">
                        {song.sessions && Object.values(song.sessions).map((session, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 min-w-[130px]">
                              {formatSessionLabel(session)}:
                            </span>
                            <span className="text-gray-800 flex-1">
                              {renderAssignedMembers(session.assignedMembers, members)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                    {showAdminActions && (
                      <td className="p-3 border-l text-center">
                        <div className="flex flex-col gap-1.5 items-center justify-center">
                          <button 
                            onClick={() => onEditSong(song)}
                            className="w-full max-w-[110px] text-xs bg-blue-600 text-white py-1.5 rounded hover:bg-blue-700 font-bold"
                          >
                            세션/인원 수정
                          </button>
                          <button 
                            onClick={() => onDeleteSong(song)}
                            className="w-full max-w-[110px] text-xs bg-red-100 text-red-600 py-1.5 rounded hover:bg-red-200 font-bold"
                          >
                            곡 삭제
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 모바일 전용 카드 뷰 */}
      <div className="block md:hidden space-y-3">
        {sortedSongs.length === 0 ? (
          <div className="p-6 text-center text-gray-500 bg-white rounded-lg border">검색 조건에 맞는 곡이 없습니다.</div>
        ) : (
          sortedSongs.map((song) => {
            const remaining = calculateUnassignedSessions(song.sessions);
            return (
              <div key={song.id} className={`bg-white border rounded-xl p-4 shadow-sm space-y-3 ${
                song.isCompleted ? 'border-blue-200 bg-blue-50/10' : song.isDropped ? 'border-red-200 bg-red-50/20' : ''
              }`}>
                <div className="flex justify-between items-start border-b pb-2">
                  <div>
                    <h3 className="font-bold text-base text-gray-900">
                      {song.title} - {song.artist}
                    </h3>
                  </div>
                  {song.isCompleted ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-blue-100 text-blue-700 border border-blue-200">
                      완성
                    </span>
                  ) : song.isDropped ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-700 border border-red-200">
                      짤
                    </span>
                  ) : (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      remaining > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      잔여 {remaining}명
                    </span>
                  )}
                </div>
                <div className="space-y-2 text-xs">
                  {song.sessions && Object.values(song.sessions).map((session, idx) => (
                    <div key={idx} className="bg-gray-50 p-2 rounded-lg">
                      <div className="font-semibold text-emerald-700 mb-0.5">
                        {formatSessionLabel(session)}
                      </div>
                      <div className="text-gray-700">
                        {renderAssignedMembers(session.assignedMembers, members)}
                      </div>
                    </div>
                  ))}
                </div>
                {showAdminActions && (
                  <div className="flex gap-2 pt-2 border-t justify-end">
                    <button 
                      onClick={() => onEditSong(song)}
                      className="text-xs bg-blue-600 text-white px-3 py-1 rounded font-bold"
                    >
                      세션/인원 수정
                    </button>
                    <button 
                      onClick={() => onDeleteSong(song)}
                      className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded font-bold"
                    >
                      곡 삭제
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// --- [관리자] 곡 세션 및 인원 수정 모달 (다중 관리자 동시 수정 실시간 반영) ---
function EditSongModal({ song, members, currentUser, onClose }) {
  const [title, setTitle] = useState(song.title || '');
  const [artist, setArtist] = useState(song.artist || '');
  const [isCompleted, setIsCompleted] = useState(song.isCompleted || false);
  const [isDropped, setIsDropped] = useState(song.isDropped || false);
  const [sessions, setSessions] = useState(
    song.sessions ? Object.values(song.sessions).map(s => ({
      ...s,
      assignedMembers: s.assignedMembers || {}
    })) : []
  );

  const [saveStatus, setSaveStatus] = useState('saved');

  useEffect(() => {
    const songRef = ref(db, `songs/${song.id}`);
    const unsubscribe = onValue(songRef, (snapshot) => {
      const liveData = snapshot.val();
      if (liveData) {
        setTitle(liveData.title || '');
        setArtist(liveData.artist || '');
        setIsCompleted(liveData.isCompleted || false);
        setIsDropped(liveData.isDropped || false);
        setSessions(
          liveData.sessions ? Object.values(liveData.sessions).map(s => ({
            ...s,
            assignedMembers: s.assignedMembers || {}
          })) : []
        );
      }
    });

    return () => unsubscribe();
  }, [song.id]);

  const saveToFirebase = (updatedFields) => {
    setSaveStatus('saving');
    
    const nextData = {
      title,
      artist,
      isCompleted,
      isDropped,
      sessions,
      ...updatedFields
    };

    const updates = {
      [`songs/${song.id}/title`]: nextData.title,
      [`songs/${song.id}/artist`]: nextData.artist,
      [`songs/${song.id}/isCompleted`]: nextData.isCompleted,
      [`songs/${song.id}/isDropped`]: nextData.isDropped,
      [`songs/${song.id}/sessions`]: nextData.sessions
    };

    update(ref(db), updates)
      .then(() => {
        setSaveStatus('saved');
      })
      .catch(err => {
        console.error("실시간 업데이트 실패:", err);
        setSaveStatus('saved');
      });
  };

  const handleTitleChange = (val) => {
    setTitle(val);
    saveToFirebase({ title: val });
  };

  const handleArtistChange = (val) => {
    setArtist(val);
    saveToFirebase({ artist: val });
  };

  const handleCompletedToggle = (checked) => {
    setIsCompleted(checked);
    const newDropped = checked ? false : isDropped;
    if (checked) setIsDropped(false);
    saveToFirebase({ isCompleted: checked, isDropped: newDropped });
  };

  const handleDroppedToggle = (checked) => {
    setIsDropped(checked);
    const newCompleted = checked ? false : isCompleted;
    if (checked) setIsCompleted(false);
    saveToFirebase({ isDropped: checked, isCompleted: newCompleted });
  };

  const addSession = () => {
    const nextSessions = [...sessions, {
      sessionName: '보컬',
      detailName: '',
      difficulty: '',
      requiredCount: 1,
      assignedMembers: {}
    }];
    setSessions(nextSessions);
    saveToFirebase({ sessions: nextSessions });
  };

  const removeSession = (index) => {
    const nextSessions = sessions.filter((_, i) => i !== index);
    setSessions(nextSessions);
    saveToFirebase({ sessions: nextSessions });
  };

  const updateSession = (index, field, value) => {
    const nextSessions = sessions.map((s, i) => {
      if (i === index) return { ...s, [field]: value };
      return s;
    });
    setSessions(nextSessions);
    saveToFirebase({ sessions: nextSessions });
  };

  const toggleMemberInSession = (sessionIndex, memberId) => {
    const nextSessions = sessions.map((s, i) => {
      if (i === sessionIndex) {
        const currentMap = { ...(s.assignedMembers || {}) };
        if (currentMap[memberId]) {
          delete currentMap[memberId];
        } else {
          currentMap[memberId] = { rank: '', isRequester: false, isPending: false };
        }
        return { ...s, assignedMembers: currentMap };
      }
      return s;
    });
    setSessions(nextSessions);
    saveToFirebase({ sessions: nextSessions });
  };

  const updateMemberRank = (sessionIndex, memberId, rankValue) => {
    const nextSessions = sessions.map((s, i) => {
      if (i === sessionIndex && s.assignedMembers[memberId]) {
        return {
          ...s,
          assignedMembers: {
            ...s.assignedMembers,
            [memberId]: { ...s.assignedMembers[memberId], rank: rankValue }
          }
        };
      }
      return s;
    });
    setSessions(nextSessions);
    saveToFirebase({ sessions: nextSessions });
  };

  const toggleRequester = (sessionIndex, memberId) => {
    const nextSessions = sessions.map((s, i) => {
      if (i === sessionIndex && s.assignedMembers[memberId]) {
        const currentVal = s.assignedMembers[memberId].isRequester;
        return {
          ...s,
          assignedMembers: {
            ...s.assignedMembers,
            [memberId]: { ...s.assignedMembers[memberId], isRequester: !currentVal }
          }
        };
      }
      return s;
    });
    setSessions(nextSessions);
    saveToFirebase({ sessions: nextSessions });
  };

  const togglePending = (sessionIndex, memberId) => {
    const nextSessions = sessions.map((s, i) => {
      if (i === sessionIndex && s.assignedMembers[memberId]) {
        const currentVal = s.assignedMembers[memberId].isPending;
        return {
          ...s,
          assignedMembers: {
            ...s.assignedMembers,
            [memberId]: { ...s.assignedMembers[memberId], isPending: !currentVal }
          }
        };
      }
      return s;
    });
    setSessions(nextSessions);
    saveToFirebase({ sessions: nextSessions });
  };

  const getFilteredMembersForSession = (sessionIndex, sessionName) => {
    const session = sessions[sessionIndex];
    const assignedMap = session?.assignedMembers || {};

    const filtered = Object.entries(members).filter(([_, m]) => {
      if (sessionName === '리드기타' || sessionName === '백킹기타') {
        return m.part === '기타';
      }
      if (sessionName === '키보드1' || sessionName === '키보드2') {
        return m.part === '키보드';
      }
      return m.part === sessionName;
    });

    filtered.sort(([aId, aMember], [bId, bMember]) => {
      const aDetail = assignedMap[aId];
      const bDetail = assignedMap[bId];

      const aChecked = !!aDetail;
      const bChecked = !!bDetail;

      if (aChecked && !bChecked) return -1;
      if (!aChecked && bChecked) return 1;

      if (aChecked && bChecked) {
        const aRank = aDetail.rank !== '' && aDetail.rank !== undefined ? Number(aDetail.rank) : null;
        const bRank = bDetail.rank !== '' && bDetail.rank !== undefined ? Number(bDetail.rank) : null;

        if (aRank !== null && bRank !== null) {
          if (aRank !== bRank) return aRank - bRank;
        }
        if (aRank !== null && bRank === null) return -1;
        if (aRank === null && bRank !== null) return 1;

        return aMember.name.localeCompare(bMember.name, 'ko');
      }

      return aMember.name.localeCompare(bMember.name, 'ko');
    });

    return filtered;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="p-5 border-b bg-white space-y-4 shrink-0 shadow-sm z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-gray-900">곡 세션 및 인원 수정</h2>
              <span className={`text-xs font-bold transition-all duration-200 ${
                saveStatus === 'saving' ? 'text-amber-500 animate-pulse' : 'text-emerald-600'
              }`}>
                {saveStatus === 'saving' ? '● 저장 중...' : '● 동기화됨'}
              </span>
            </div>
            <button 
              onClick={onClose} 
              className="px-3.5 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition"
            >
              닫기
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">곡명</label>
              <input 
                type="text" 
                value={title} 
                onChange={e => handleTitleChange(e.target.value)} 
                className="w-full border p-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">가수</label>
              <input 
                type="text" 
                value={artist} 
                onChange={e => handleArtistChange(e.target.value)} 
                className="w-full border p-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-blue-50/70 p-2.5 rounded-lg border border-blue-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-blue-900 block">곡 "완성" 설정</span>
                <span className="text-[11px] text-blue-600">완성 시 파란색 배지 반영</span>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isCompleted} 
                  onChange={e => handleCompletedToggle(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 relative"></div>
              </label>
            </div>

            <div className="bg-red-50/70 p-2.5 rounded-lg border border-red-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-red-900 block">곡 "짤" 설정</span>
                <span className="text-[11px] text-red-600">학회원 페이지에서 숨김</span>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isDropped} 
                  onChange={e => handleDroppedToggle(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600 relative"></div>
              </label>
            </div>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-3 flex-1 bg-gray-50/50">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm text-gray-800">세션 설정 (★: 신청자, [보류]: 보류)</h3>
            <button 
              onClick={addSession} 
              className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded hover:bg-emerald-700 font-bold"
            >
              + 세션 추가
            </button>
          </div>

          {sessions.map((session, sIdx) => {
            const eligibleMembers = getFilteredMembersForSession(sIdx, session.sessionName);
            const showDetailName = session.sessionName.includes('키보드');
            const showDifficulty = session.sessionName !== '보컬';

            return (
              <div key={sIdx} className="border p-3 rounded-lg bg-white shadow-sm space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select 
                    value={session.sessionName} 
                    onChange={e => updateSession(sIdx, 'sessionName', e.target.value)}
                    className="border p-1 text-xs rounded font-bold bg-white"
                  >
                    {SONG_SESSION_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>

                  {showDetailName && (
                    <input 
                      type="text" 
                      placeholder="세부파트 (예: 1, 2)" 
                      value={session.detailName || ''} 
                      onChange={e => updateSession(sIdx, 'detailName', e.target.value)}
                      className="border p-1 text-xs rounded w-28 bg-white"
                    />
                  )}

                  {showDifficulty && (
                    <input 
                      type="text" 
                      placeholder="난이도 (예: 상, 중)" 
                      value={session.difficulty || ''} 
                      onChange={e => updateSession(sIdx, 'difficulty', e.target.value)}
                      className="border p-1 text-xs rounded w-24 bg-white"
                    />
                  )}

                  <button 
                    onClick={() => removeSession(sIdx)} 
                    className="ml-auto text-xs text-red-600 hover:underline font-bold"
                  >
                    삭제
                  </button>
                </div>

                <div className="pt-2 border-t">
                  <span className="text-xs font-bold text-gray-800 block mb-1">
                    [{session.sessionName}] 학회원 선택:
                  </span>
                  <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto bg-gray-50 p-2 border rounded">
                    {eligibleMembers.length === 0 ? (
                      <span className="text-xs text-gray-400">해당 세션 학회원이 없습니다.</span>
                    ) : (
                      eligibleMembers.map(([mId, m]) => {
                        const assignedMap = session.assignedMembers || {};
                        const isChecked = !!assignedMap[mId];
                        const currentRank = assignedMap[mId]?.rank || '';
                        const isRequester = assignedMap[mId]?.isRequester || false;
                        const isPending = assignedMap[mId]?.isPending || false;

                        return (
                          <div key={mId} className={`flex items-center gap-1.5 text-xs p-1 rounded border transition-all ${
                            isChecked ? 'bg-emerald-50 border-emerald-500 font-bold' : 'bg-white border-gray-200'
                          }`}>
                            <label className="inline-flex items-center gap-1 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={isChecked}
                                onChange={() => toggleMemberInSession(sIdx, mId)}
                                className="rounded text-emerald-600 focus:ring-0"
                              />
                              {m.name}({m.generation}기)
                            </label>

                            {isChecked && (
                              <>
                                <input 
                                  type="number" 
                                  placeholder="순위"
                                  min="1"
                                  value={currentRank}
                                  onChange={e => updateMemberRank(sIdx, mId, e.target.value)}
                                  className="w-9 border text-center text-xs p-0.5 rounded bg-white font-normal"
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleRequester(sIdx, mId)}
                                  className={`px-1 py-0.5 text-xs rounded transition ${
                                    isRequester ? 'text-blue-600 font-extrabold' : 'text-gray-300 hover:text-blue-400'
                                  }`}
                                >
                                  {isRequester ? '★' : '☆'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => togglePending(sIdx, mId)}
                                  className={`px-1.5 py-0.5 text-[11px] rounded border font-bold ${
                                    isPending ? 'bg-amber-500 text-white border-amber-600' : 'bg-gray-100 text-gray-400 border-gray-300'
                                  }`}
                                >
                                  보류
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- [페이지 1] 학회원 메인 페이지 (/) ---
function PublicPage({ songs, members, targetSongCount, pageTitle }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAvailableOnly, setFilterAvailableOnly] = useState(false);
  const [filterCompletedOnly, setFilterCompletedOnly] = useState(false);

  const publicSongs = songs.filter(song => {
    if (song.isDropped) return false;
    
    if (filterCompletedOnly && !song.isCompleted) {
      return false;
    }

    // 수정: 잔여 선택 시 완성이 아닌 곡은 잔여 세션 개수가 0이어도 모두 표시
    if (filterAvailableOnly) {
      if (song.isCompleted) {
        return false;
      }
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const titleMatch = song.title.toLowerCase().includes(term);
      const artistMatch = song.artist.toLowerCase().includes(term);
      
      const memberMatch = song.sessions && Object.values(song.sessions).some(s => 
        s.assignedMembers && Object.keys(s.assignedMembers).some(mId => 
          members[mId] && members[mId].name.toLowerCase().includes(term)
        )
      );

      return titleMatch || artistMatch || memberMatch;
    }

    return true;
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto font-sans space-y-6">
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm pt-2 pb-4 space-y-4 border-b">
        <div className="relative flex items-center justify-center">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 text-center">
            {pageTitle || '🔥불꽃: 2026 2정공 곡회의🔥'}
          </h1>
          <Link 
            to="/admin" 
            className="absolute right-0 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg border font-medium transition"
          >
            관리자 페이지
          </Link>
        </div>

        <ProgressBarStatus songs={songs} targetSongCount={targetSongCount} />
      </div>

      <SongFilterBar 
        searchTerm={searchTerm} 
        setSearchTerm={setSearchTerm} 
        filterAvailableOnly={filterAvailableOnly} 
        setFilterAvailableOnly={setFilterAvailableOnly} 
        filterCompletedOnly={filterCompletedOnly}
        setFilterCompletedOnly={setFilterCompletedOnly}
      />

      <SongListView songs={publicSongs} members={members} />
    </div>
  );
}

// --- [페이지 2] 관리자 페이지 (/admin) ---
function AdminPage({ songs, members, targetSongCount, pageTitle, admins, logs }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  
  const [activeTab, setActiveTab] = useState('manage');
  const [editingSong, setEditingSong] = useState(null);
  const [targetInput, setTargetInput] = useState(targetSongCount);
  const [titleInput, setTitleInput] = useState(pageTitle || '🔥불꽃: 2026 2정공 곡회의🔥');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterAvailableOnly, setFilterAvailableOnly] = useState(false);
  const [filterCompletedOnly, setFilterCompletedOnly] = useState(false);

  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [selectedMemberToRemove, setSelectedMemberToRemove] = useState(null);

  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [selectedInitialSessions, setSelectedInitialSessions] = useState(
    SONG_SESSION_TYPES.reduce((acc, curr) => ({ ...acc, [curr]: true }), {})
  );

  const [memberName, setMemberName] = useState('');
  const [memberGen, setMemberGen] = useState('');
  const [memberPart, setMemberPart] = useState(MEMBER_PART_TYPES[0]);
  const [selectedSessionFilter, setSelectedSessionFilter] = useState('전체');

  const [newAdminId, setNewAdminId] = useState('');
  const [newAdminPw, setNewAdminPw] = useState('');
  const [newAdminName, setNewAdminName] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    setTargetInput(targetSongCount);
  }, [targetSongCount]);

  useEffect(() => {
    setTitleInput(pageTitle || '🔥불꽃: 2026 2정공 곡회의🔥');
  }, [pageTitle]);

  const handleLogin = (e) => {
    e.preventDefault();
    
    if (usernameInput === 'admin' && passwordInput === 'admin') {
      setCurrentUser({ id: 'admin', name: '최고 관리자', isSuperAdmin: true });
      return;
    }

    const matched = Object.values(admins).find(a => a.id === usernameInput && a.pw === passwordInput);
    if (matched) {
      setCurrentUser({ id: matched.id, name: matched.name, isSuperAdmin: false });
    } else {
      alert('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setUsernameInput('');
    setPasswordInput('');
  };

  const handleRemoveMemberFromUncompletedSongs = () => {
    if (!selectedMemberToRemove) {
      alert("제거할 학회원을 먼저 검색하여 선택해주세요.");
      return;
    }

    const memberNameStr = `${selectedMemberToRemove.name}(${selectedMemberToRemove.generation}기)`;

    if (!window.confirm(`'${memberNameStr}' 님을 [완성] 및 [짤]이 아닌 모든 미완성 곡의 세션에서 제거하시겠습니까?`)) {
      return;
    }

    const updates = {};
    let affectedSongsCount = 0;

    songs.forEach(song => {
      if (song.isCompleted || song.isDropped) return;

      let songModified = false;
      const updatedSessions = song.sessions ? Object.values(song.sessions).map(session => {
        if (session.assignedMembers && session.assignedMembers[selectedMemberToRemove.id]) {
          const newAssigned = { ...session.assignedMembers };
          delete newAssigned[selectedMemberToRemove.id];
          songModified = true;
          return { ...session, assignedMembers: newAssigned };
        }
        return session;
      }) : [];

      if (songModified) {
        updates[`songs/${song.id}/sessions`] = updatedSessions;
        affectedSongsCount += 1;
      }
    });

    if (affectedSongsCount === 0) {
      alert("해당 학회원이 명단에 포함된 미완성 곡이 없습니다.");
      return;
    }

    update(ref(db), updates)
      .then(() => {
        logActivity(currentUser, `[일괄 제거] ${memberNameStr} 님을 미완성 곡 ${affectedSongsCount}개에서 제거함`);
        alert(`${memberNameStr} 님이 총 ${affectedSongsCount}개 곡에서 제거되었습니다.`);
        setSelectedMemberToRemove(null);
        setMemberSearchQuery('');
      })
      .catch(err => alert("일괄 제거 실패: " + err.message));
  };

  const handleExecuteSort = () => {
    if (!window.confirm("정렬 순서(완성 → 잔여 0명...6명 → 짤)대로 배치하시겠습니까?")) return;

    const sorted = [...songs].sort((a, b) => {
      if (a.isCompleted && !b.isCompleted) return -1;
      if (!a.isCompleted && b.isCompleted) return 1;
      if (a.isDropped && !b.isDropped) return 1;
      if (!a.isDropped && b.isDropped) return -1;
      if ((a.isCompleted && b.isCompleted) || (a.isDropped && b.isDropped)) return 0;

      const remA = calculateUnassignedSessions(a.sessions);
      const remB = calculateUnassignedSessions(b.sessions);
      return remA - remB;
    });

    const updates = {};
    sorted.forEach((song, index) => {
      updates[`songs/${song.id}/order`] = index + 1;
    });

    update(ref(db), updates)
      .then(() => {
        logActivity(currentUser, "잔여 인원순 정렬 실행");
        alert("정렬이 적용되었습니다.");
      })
      .catch((err) => alert("정렬 오류: " + err.message));
  };

  const handleSaveTargetCount = () => {
    set(ref(db, 'settings/targetSongCount'), Number(targetInput))
      .then(() => {
        logActivity(currentUser, `목표 곡 수 변경 -> ${targetInput}곡`);
        alert("목표 곡 수가 저장되었습니다.");
      })
      .catch(err => alert("저장 실패: " + err.message));
  };

  const handleSavePageTitle = () => {
    if (!titleInput.trim()) {
      alert("홈페이지 제목을 입력해주세요.");
      return;
    }
    set(ref(db, 'settings/pageTitle'), titleInput.trim())
      .then(() => {
        logActivity(currentUser, `홈페이지 제목 변경 -> [${titleInput.trim()}]`);
        alert("홈페이지 제목이 수정되었습니다.");
      })
      .catch(err => alert("저장 실패: " + err.message));
  };

  const toggleInitialSession = (st) => {
    setSelectedInitialSessions(prev => ({ ...prev, [st]: !prev[st] }));
  };

  const handleAddSong = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const initialSessions = SONG_SESSION_TYPES
      .filter(st => selectedInitialSessions[st])
      .map(st => ({ sessionName: st, requiredCount: 1, assignedMembers: {} }));

    const songsRef = ref(db, 'songs');
    const newSongRef = push(songsRef);
    set(newSongRef, {
      id: newSongRef.key,
      title: newTitle,
      artist: newArtist || '아티스트 미정',
      isCompleted: false,
      isDropped: false,
      order: songs.length + 1,
      sessions: initialSessions
    });

    logActivity(currentUser, `새 곡 추가: [${newTitle} - ${newArtist || '아티스트 미정'}]`);
    setNewTitle('');
    setNewArtist('');
  };

  const handleDeleteSong = (song) => {
    if (window.confirm(`정말 '${song.title}' 곡을 완전 삭제하시겠습니까?`)) {
      remove(ref(db, `songs/${song.id}`));
      logActivity(currentUser, `곡 삭제: [${song.title} - ${song.artist}]`);
    }
  };

  const handleAddMember = (e) => {
    e.preventDefault();
    if (!memberName.trim()) return;
    const membersRef = ref(db, 'members');
    const newMemberRef = push(membersRef);
    set(newMemberRef, {
      id: newMemberRef.key,
      name: memberName,
      generation: memberGen || '기수 미정',
      part: memberPart
    });
    logActivity(currentUser, `학회원 신규 등록: ${memberName}(${memberGen}기) - ${memberPart}`);
    setMemberName('');
    setMemberGen('');
  };

  const handleDeleteMember = (memberId, name) => {
    if (window.confirm('학회원을 목록에서 삭제하시겠습니까?')) {
      remove(ref(db, `members/${memberId}`));
      logActivity(currentUser, `학회원 삭제: ${name}`);
    }
  };

  const handleAddAdmin = (e) => {
    e.preventDefault();
    if (!newAdminId.trim() || !newAdminPw.trim() || !newAdminName.trim()) return;
    if (newAdminId === 'admin') {
      alert("admin 아이디는 최고 권한자 전용입니다.");
      return;
    }

    const adminRef = ref(db, `admins/${newAdminId}`);
    set(adminRef, {
      id: newAdminId,
      pw: newAdminPw,
      name: newAdminName
    });

    logActivity(currentUser, `일반 관리자 계정 생성: ${newAdminName}(${newAdminId})`);
    setNewAdminId('');
    setNewAdminPw('');
    setNewAdminName('');
    alert("관리자 계정이 성공적으로 등록되었습니다.");
  };

  const handleDeleteAdmin = (adminKey) => {
    if (window.confirm("해당 관리자 계정을 삭제하시겠습니까?")) {
      remove(ref(db, `admins/${adminKey}`));
      logActivity(currentUser, `일반 관리자 계정 삭제: ${adminKey}`);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-white p-6 rounded-xl border shadow-sm max-w-sm w-full space-y-4">
          <div className="text-center">
            <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold">관리자 인증</span>
            <h2 className="text-lg font-bold text-gray-800 mt-1">관리자 로그인</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">아이디</label>
              <input 
                type="text" 
                placeholder="아이디"
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                className="w-full border p-2 text-sm rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">비밀번호</label>
              <input 
                type="password" 
                placeholder="비밀번호"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                className="w-full border p-2 text-sm rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button 
              type="button" 
              onClick={() => navigate('/')} 
              className="w-1/2 bg-gray-100 text-gray-600 py-2 rounded text-xs font-bold"
            >
              홈으로
            </button>
            <button 
              type="submit" 
              className="w-1/2 bg-emerald-600 text-white py-2 rounded text-xs font-bold hover:bg-emerald-700"
            >
              로그인
            </button>
          </div>
        </form>
      </div>
    );
  }

  const filteredSongs = songs.filter(song => {
    if (filterCompletedOnly && !song.isCompleted) {
      return false;
    }

    // 수정: 잔여 선택 시 completed와 dropped를 제외하고 0명 잔여 포함 전체 표시
    if (filterAvailableOnly) {
      if (song.isCompleted || song.isDropped) {
        return false;
      }
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const titleMatch = song.title.toLowerCase().includes(term);
      const artistMatch = song.artist.toLowerCase().includes(term);
      
      const memberMatch = song.sessions && Object.values(song.sessions).some(s => 
        s.assignedMembers && Object.keys(s.assignedMembers).some(mId => 
          members[mId] && members[mId].name.toLowerCase().includes(term)
        )
      );

      return titleMatch || artistMatch || memberMatch;
    }

    return true;
  });

  const filteredMembers = Object.entries(members).filter(([_, m]) => {
    if (selectedSessionFilter === '전체') return true;
    return m.part === selectedSessionFilter;
  });
  filteredMembers.sort((a, b) => a[1].name.localeCompare(b[1].name, 'ko'));

  const searchedMembersList = Object.entries(members)
    .map(([id, m]) => ({ id, ...m }))
    .filter(m => {
      if (!memberSearchQuery.trim()) return false;
      return m.name.toLowerCase().includes(memberSearchQuery.trim().toLowerCase());
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const sortedLogs = Object.values(logs).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto font-sans space-y-6">
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm pt-2 pb-4 space-y-4 border-b">
        <div className="relative flex items-center justify-center">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                currentUser.isSuperAdmin ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {currentUser.name} ({currentUser.id})
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 mt-1">곡회의 관리자 센터</h1>
          </div>
          <div className="absolute right-0 flex items-center gap-2">
            <button 
              onClick={handleLogout} 
              className="text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg transition font-medium"
            >
              로그아웃
            </button>
            <button 
              onClick={() => navigate('/')} 
              className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1.5 rounded-lg transition font-medium"
            >
              학회원 화면
            </button>
          </div>
        </div>

        <ProgressBarStatus songs={songs} targetSongCount={targetSongCount} />
      </div>

      <div className="flex border-b overflow-x-auto">
        <button 
          onClick={() => setActiveTab('manage')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition ${
            activeTab === 'manage' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          1. 곡 현황
        </button>
        <button 
          onClick={() => setActiveTab('add')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition ${
            activeTab === 'add' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          2. 곡 추가
        </button>
        <button 
          onClick={() => setActiveTab('members')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition ${
            activeTab === 'members' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          3. 학회원 관리
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition ${
            activeTab === 'settings' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          4. 목표 곡 수 설정
        </button>
        
        {currentUser.isSuperAdmin && (
          <>
            <button 
              onClick={() => setActiveTab('admin_users')}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition ${
                activeTab === 'admin_users' ? 'border-red-700 text-red-800' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              5. 관리자 계정 관리 ★
            </button>
            <button 
              onClick={() => setActiveTab('site_manage')}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition ${
                activeTab === 'site_manage' ? 'border-red-700 text-red-800' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              6. 홈페이지 관리 ★
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition ${
                activeTab === 'logs' ? 'border-red-700 text-red-800' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              7. 수정 로그 확인 ★
            </button>
          </>
        )}
      </div>

      {activeTab === 'manage' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-3">
            <div className="text-xs font-bold text-amber-900 flex items-center gap-1">
              <span>🧹</span>
              <span>학회원 일괄 제거 (미완성 곡 한정)</span>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
              <div className="relative w-full sm:w-64">
                <input 
                  type="text"
                  placeholder="이름 검색 (예: 김)"
                  value={memberSearchQuery}
                  onChange={e => {
                    setMemberSearchQuery(e.target.value);
                    setSelectedMemberToRemove(null);
                  }}
                  className="w-full border p-2 text-xs rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                />
                {memberSearchQuery.trim() && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto z-50 divide-y">
                    {searchedMembersList.length === 0 ? (
                      <div className="p-2.5 text-xs text-gray-400 text-center">검색 결과가 없습니다.</div>
                    ) : (
                      searchedMembersList.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedMemberToRemove(m);
                            setMemberSearchQuery('');
                          }}
                          className="w-full text-left p-2 text-xs hover:bg-amber-50 flex justify-between items-center"
                        >
                          <span className="font-bold text-gray-800">{m.name}</span>
                          <span className="text-[11px] text-gray-500">{m.generation}기 · {m.part}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {selectedMemberToRemove && (
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-amber-300 text-xs">
                  <span className="font-bold text-amber-900">
                    선택됨: {selectedMemberToRemove.name} ({selectedMemberToRemove.generation}기)
                  </span>
                  <button 
                    onClick={() => setSelectedMemberToRemove(null)}
                    className="text-gray-400 hover:text-red-500 font-bold ml-1"
                  >
                    ✕
                  </button>
                </div>
              )}

              <button 
                onClick={handleRemoveMemberFromUncompletedSongs}
                className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm shrink-0"
              >
                미완성 곡에서 일괄 제거
              </button>
            </div>

            <p className="text-[11px] text-amber-700 italic">
              * 이름 일부를 입력하여 대상을 검색한 뒤 클릭해 선택하세요. '완성' 및 '짤' 상태인 곡은 유지되며 미완성 곡에서만 제거됩니다.
            </p>
          </div>

          <div className="flex flex-wrap justify-between items-center bg-gray-50 p-3 rounded-lg border gap-2">
            <span className="text-xs font-semibold text-gray-700">
              💡 클릭 시 [완성 → 잔여 인원 적은 순 → 짤] 순서로 재배치됩니다.
            </span>
            <button 
              onClick={handleExecuteSort}
              className="px-3.5 py-1.5 rounded text-xs font-bold transition bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5"
            >
              <span>↕</span>
              <span>정렬 순서 즉시 적용하기</span>
            </button>
          </div>

          <SongFilterBar 
            searchTerm={searchTerm} 
            setSearchTerm={setSearchTerm} 
            filterAvailableOnly={filterAvailableOnly} 
            setFilterAvailableOnly={setFilterAvailableOnly} 
            filterCompletedOnly={filterCompletedOnly}
            setFilterCompletedOnly={setFilterCompletedOnly}
          />

          <SongListView 
            songs={filteredSongs} 
            members={members} 
            showAdminActions={true}
            onEditSong={(song) => setEditingSong(song)}
            onDeleteSong={handleDeleteSong}
          />
        </div>
      )}

      {activeTab === 'add' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-emerald-50/50 p-6 rounded-xl border border-emerald-200 space-y-4 h-fit">
            <h2 className="font-bold text-gray-900 text-base">새 곡 추가하기</h2>
            <form onSubmit={handleAddSong} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">새 곡명 *</label>
                  <input 
                    type="text" 
                    placeholder="곡 제목 입력" 
                    value={newTitle} 
                    onChange={e => setNewTitle(e.target.value)}
                    className="w-full border p-2 text-sm rounded bg-white"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">가수명</label>
                  <input 
                    type="text" 
                    placeholder="가수 이름 입력" 
                    value={newArtist} 
                    onChange={e => setNewArtist(e.target.value)}
                    className="w-full border p-2 text-sm rounded bg-white"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-emerald-200">
                <span className="text-xs font-bold text-gray-700 block mb-2">포함할 기본 세션 선택:</span>
                <div className="flex flex-wrap gap-3 text-xs bg-white p-3 rounded border border-emerald-200">
                  {SONG_SESSION_TYPES.map(st => (
                    <label key={st} className="inline-flex items-center gap-1.5 cursor-pointer font-medium text-gray-800">
                      <input 
                        type="checkbox" 
                        checked={!!selectedInitialSessions[st]} 
                        onChange={() => toggleInitialSession(st)}
                        className="rounded text-emerald-600 focus:ring-0"
                      />
                      {st}
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button type="submit" className="bg-emerald-600 text-white px-6 py-2 rounded text-sm font-bold hover:bg-emerald-700">
                  + 곡 추가하기
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white p-5 rounded-xl border shadow-sm space-y-3 h-fit">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-sm text-gray-800">🎵 현재 등록된 곡 ({songs.length}곡)</h3>
            </div>
            <div className="max-h-[400px] overflow-y-auto space-y-1.5 pr-1">
              {songs.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">등록된 곡이 없습니다.</p>
              ) : (
                songs.map((s, idx) => (
                  <div key={s.id || idx} className="text-xs p-2 bg-gray-50 rounded border flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-800 truncate">
                      {s.title} <span className="text-gray-500 font-normal">- {s.artist}</span>
                    </span>
                    {s.isCompleted && <span className="shrink-0 text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded">완성</span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'members' && (
        <div className="space-y-6">
          <form onSubmit={handleAddMember} className="bg-blue-50 p-4 rounded-xl border border-blue-200 flex flex-wrap gap-2 items-end">
            <div className="w-32">
              <label className="text-xs font-bold text-blue-900 block mb-1">이름</label>
              <input 
                type="text" 
                placeholder="이름" 
                value={memberName} 
                onChange={e => setMemberName(e.target.value)}
                className="w-full border p-2 text-sm rounded bg-white"
              />
            </div>
            <div className="w-24">
              <label className="text-xs font-bold text-blue-900 block mb-1">기수</label>
              <input 
                type="text" 
                placeholder="예: 6" 
                value={memberGen} 
                onChange={e => setMemberGen(e.target.value)}
                className="w-full border p-2 text-sm rounded bg-white"
              />
            </div>
            <div className="w-36">
              <label className="text-xs font-bold text-blue-900 block mb-1">주요 세션</label>
              <select 
                value={memberPart} 
                onChange={e => setMemberPart(e.target.value)}
                className="w-full border p-2 text-sm rounded bg-white font-bold"
              >
                {MEMBER_PART_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
            <button type="submit" className="bg-blue-700 text-white px-4 py-2 rounded text-sm font-bold hover:bg-blue-800">
              + 학회원 등록
            </button>
          </form>

          <div className="flex gap-1 overflow-x-auto pb-1">
            {['전체', ...MEMBER_PART_TYPES].map(st => (
              <button 
                key={st}
                onClick={() => setSelectedSessionFilter(st)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
                  selectedSessionFilter === st ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredMembers.length === 0 ? (
              <div className="col-span-full p-8 text-center text-gray-400">등록된 학회원이 없습니다.</div>
            ) : (
              filteredMembers.map(([id, member]) => (
                <div key={id} className="border p-3 rounded-lg bg-white shadow-sm flex justify-between items-center">
                  <div>
                    <span className="font-bold text-sm text-gray-900 block">{member.name}</span>
                    <span className="text-xs text-gray-500">{member.generation}기 · {member.part}</span>
                  </div>
                  <button 
                    onClick={() => handleDeleteMember(id, member.name)}
                    className="text-xs text-red-400 hover:text-red-600 font-bold p-1"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="max-w-md bg-white p-6 rounded-xl border shadow-sm space-y-4">
          <h2 className="font-bold text-gray-800 text-base">완성 목표 곡 수 설정</h2>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">목표 곡 개수 (N곡)</label>
            <input 
              type="number" 
              min="0"
              value={targetInput} 
              onChange={e => setTargetInput(e.target.value)}
              className="w-full border p-2 text-sm rounded bg-gray-50 font-bold"
            />
          </div>
          <button 
            onClick={handleSaveTargetCount} 
            className="w-full bg-emerald-600 text-white py-2 rounded text-xs font-bold hover:bg-emerald-700"
          >
            목표 곡 수 저장하기
          </button>
        </div>
      )}

      {activeTab === 'admin_users' && currentUser.isSuperAdmin && (
        <div className="space-y-6">
          <form onSubmit={handleAddAdmin} className="bg-red-50 p-4 rounded-xl border border-red-200 flex flex-wrap gap-3 items-end">
            <div className="w-36">
              <label className="text-xs font-bold text-red-900 block mb-1">관리자 아이디</label>
              <input 
                type="text" 
                placeholder="아이디" 
                value={newAdminId} 
                onChange={e => setNewAdminId(e.target.value)}
                className="w-full border p-2 text-sm rounded bg-white"
                required
              />
            </div>
            <div className="w-36">
              <label className="text-xs font-bold text-red-900 block mb-1">비밀번호</label>
              <input 
                type="text" 
                placeholder="비밀번호" 
                value={newAdminPw} 
                onChange={e => setNewAdminPw(e.target.value)}
                className="w-full border p-2 text-sm rounded bg-white"
                required
              />
            </div>
            <div className="w-36">
              <label className="text-xs font-bold text-red-900 block mb-1">관리자 이름</label>
              <input 
                type="text" 
                placeholder="예: 홍길동" 
                value={newAdminName} 
                onChange={e => setNewAdminName(e.target.value)}
                className="w-full border p-2 text-sm rounded bg-white"
                required
              />
            </div>
            <button type="submit" className="bg-red-700 text-white px-4 py-2 rounded text-sm font-bold hover:bg-red-800">
              + 일반 관리자 계정 추가
            </button>
          </form>

          <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b text-gray-700">
                  <th className="p-3">아이디</th>
                  <th className="p-3">비밀번호</th>
                  <th className="p-3">이름</th>
                  <th className="p-3 text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b bg-red-50/30 font-semibold">
                  <td className="p-3">admin</td>
                  <td className="p-3">admin</td>
                  <td className="p-3 text-red-700">최고 관리자 (기본 계정)</td>
                  <td className="p-3 text-center text-xs text-gray-400">삭제 불가</td>
                </tr>
                {Object.entries(admins).map(([key, admin]) => (
                  <tr key={key} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-mono">{admin.id}</td>
                    <td className="p-3 font-mono">{admin.pw}</td>
                    <td className="p-3 font-bold">{admin.name}</td>
                    <td className="p-3 text-center">
                      <button 
                        onClick={() => handleDeleteAdmin(key)} 
                        className="text-xs text-red-600 hover:underline font-bold"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'site_manage' && currentUser.isSuperAdmin && (
        <div className="max-w-md bg-white p-6 rounded-xl border shadow-sm space-y-4">
          <h2 className="font-bold text-gray-800 text-base">홈페이지 메인 제목 관리</h2>
          <div>
            <label className="text-xs font-bold text-gray-600 block mb-1">메인 제목</label>
            <input 
              type="text" 
              value={titleInput} 
              onChange={e => setTitleInput(e.target.value)}
              placeholder="예: 🔥불꽃: 2026 2정공 곡회의🔥"
              className="w-full border p-2 text-sm rounded bg-gray-50 font-bold"
            />
          </div>
          <button 
            onClick={handleSavePageTitle} 
            className="w-full bg-red-600 text-white py-2 rounded text-xs font-bold hover:bg-red-700"
          >
            제목 수정 저장하기
          </button>
        </div>
      )}

      {activeTab === 'logs' && (
        currentUser.isSuperAdmin ? (
          <div className="space-y-4">
            <h2 className="font-bold text-gray-800 text-base">실시간 수정 로그 목록 (최신순)</h2>
            <div className="bg-white border rounded-xl shadow-sm p-4 max-h-[600px] overflow-y-auto space-y-2">
              {sortedLogs.length === 0 ? (
                <div className="text-center text-gray-400 py-8">기록된 수정 로그가 없습니다.</div>
              ) : (
                sortedLogs.map((log, index) => (
                  <div key={index} className="text-xs p-2.5 bg-gray-50 rounded border flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-gray-400">{log.timestamp}</span>
                      <span className="font-bold text-gray-800 bg-emerald-100 px-2 py-0.5 rounded">
                        {log.adminName}({log.adminId})
                      </span>
                    </div>
                    <span className="text-gray-800 font-medium flex-1 sm:ml-2">{log.action}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-red-600 font-bold bg-red-50 rounded-xl border border-red-200">
            수정 로그는 최고 관리자만 조회할 수 있습니다.
          </div>
        )
      )}

      {editingSong && (
        <EditSongModal 
          song={editingSong} 
          members={members} 
          currentUser={currentUser}
          onClose={() => setEditingSong(null)} 
        />
      )}
    </div>
  );
}

export default function App() {
  const [songs, setSongs] = useState([]);
  const [members, setMembers] = useState({});
  const [admins, setAdmins] = useState({});
  const [logs, setLogs] = useState({});
  const [targetSongCount, setTargetSongCount] = useState(10);
  const [pageTitle, setPageTitle] = useState('🔥불꽃: 2026 2정공 곡회의🔥');

  useEffect(() => {
    const songsRef = ref(db, 'songs');
    const membersRef = ref(db, 'members');
    const adminsRef = ref(db, 'admins');
    const logsRef = ref(db, 'logs');
    const targetRef = ref(db, 'settings/targetSongCount');
    const titleRef = ref(db, 'settings/pageTitle');

    onValue(songsRef, (snapshot) => {
      const data = snapshot.val();
      setSongs(data ? Object.values(data) : []);
    });

    onValue(membersRef, (snapshot) => {
      setMembers(snapshot.val() || {});
    });

    onValue(adminsRef, (snapshot) => {
      setAdmins(snapshot.val() || {});
    });

    onValue(logsRef, (snapshot) => {
      setLogs(snapshot.val() || {});
    });

    onValue(targetRef, (snapshot) => {
      const val = snapshot.val();
      if (val !== null) setTargetSongCount(Number(val));
    });

    onValue(titleRef, (snapshot) => {
      const val = snapshot.val();
      if (val) setPageTitle(val);
    });
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicPage songs={songs} members={members} targetSongCount={targetSongCount} pageTitle={pageTitle} />} />
        <Route path="/admin" element={<AdminPage songs={songs} members={members} targetSongCount={targetSongCount} pageTitle={pageTitle} admins={admins} logs={logs} />} />
      </Routes>
    </BrowserRouter>
  );
}
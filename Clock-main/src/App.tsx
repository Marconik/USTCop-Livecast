import {useEffect, useRef, useState} from 'react';
import type {Dispatch, SetStateAction} from 'react';
import ClockOverlay from './components/ClockOverlay';
import {
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Eye,
  EyeOff,
  Loader2,
  MonitorPlay,
  Plus,
  RadioTower,
  RefreshCw,
  Shuffle,
  SlidersHorizontal,
  Trophy,
  Users,
} from 'lucide-react';

type GroupKey = 'A' | 'B' | 'C' | 'D' | 'E';

type Participant = {
  number: string;
  id: string;
};

type MatchRound = {
  id: number;
  label: string;
  players: [Participant, Participant];
};

type RoundScoreState = {
  status: 'idle' | 'playing' | 'finished';
  showSongTwo: boolean;
  showSongThree: boolean;
  songOne: [string, string];
  songTwo: [string, string];
  songThree: [string, string];
};

type ScoreSong = 'songOne' | 'songTwo' | 'songThree';
type LoadState = 'idle' | 'loading' | 'loaded';
type Page = 'home' | 'elimination' | 'semifinal' | 'final';

type SchedulePayload = {
  group: GroupKey;
  participants: Participant[];
  rounds: MatchRound[];
};

type ObsSceneItem = {
  id: number;
  name: string;
  enabled: boolean;
  inputKind?: string;
  isGroup?: boolean;
};

type ObsScene = {
  name: string;
  index?: number;
  items: ObsSceneItem[];
};

type ObsTransition = {
  name: string;
  kind?: string;
  fixed?: boolean;
};

type ScoreImages = {
  paths: [string, string];
  songCount: 2 | 3;
};

type ObsState = {
  connected: boolean;
  currentScene?: string;
  currentTransition?: string;
  scenes: ObsScene[];
  transitions: ObsTransition[];
};

const groups: GroupKey[] = ['A', 'B', 'C', 'D', 'E'];
const OBS_VIDEO_TRANSITION_NAME = '插入视频';
const OBS_FADE_TRANSITION_NAME = '淡入淡出';
const OBS_GROUP_SCENE_NAME = '组别';
const OBS_ROUND_SCENE_NAME = '轮数';
const OBS_ELIMINATION_ROUND_SOURCE_NAME = '淘汰赛.png';
const OBS_SEMIFINAL_ROUND_SOURCE_NAME = '半决赛.png';
const OBS_FINAL_ROUND_SOURCE_NAME = '总决赛.png';
const OBS_SCORE_SCENE_NAME = '成绩';
const OBS_SCORE_IMAGE_SOURCE_NAMES = ['score1.png', 'score2.png'];
const OBS_TEMP_SCORE_IMAGE_DISPLAY_MS = 5000;

const emptyRoundScore = (): RoundScoreState => ({
  status: 'idle',
  showSongTwo: false,
  showSongThree: false,
  songOne: ['', ''],
  songTwo: ['', ''],
  songThree: ['', ''],
});

const createInitialScores = (rounds: MatchRound[]) =>
  rounds.reduce<Record<number, RoundScoreState>>((acc, round) => {
    acc[round.id] = emptyRoundScore();
    return acc;
  }, {});

const scoreToNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getRoundTotals = (scoreState: RoundScoreState): [number, number] => [
  scoreToNumber(scoreState.songOne[0]) +
    scoreToNumber(scoreState.songTwo[0]) +
    scoreToNumber(scoreState.songThree[0]),
  scoreToNumber(scoreState.songOne[1]) +
    scoreToNumber(scoreState.songTwo[1]) +
    scoreToNumber(scoreState.songThree[1]),
];

const getRoundWinner = (round: MatchRound, scoreState: RoundScoreState) => {
  const totals = getRoundTotals(scoreState);
  return totals[0] >= totals[1] ? round.players[0] : round.players[1];
};

const createSemifinalRounds = (
  eliminationRounds: MatchRound[],
  eliminationScores: Record<number, RoundScoreState>,
): MatchRound[] => {
  const winnerByRound = eliminationRounds.reduce<Record<number, Participant>>((acc, round) => {
    acc[round.id] = getRoundWinner(round, eliminationScores[round.id] ?? emptyRoundScore());
    return acc;
  }, {});

  const pairings = [
    [1, 4],
    [2, 3],
  ];

  return pairings
    .filter(([firstRound, secondRound]) => winnerByRound[firstRound] && winnerByRound[secondRound])
    .map(([firstRound, secondRound], index) => ({
      id: index + 5,
      label: `半决赛 ${index + 1}`,
      players: [winnerByRound[firstRound], winnerByRound[secondRound]],
    }));
};

const createFinalRounds = (
  semifinalRounds: MatchRound[],
  semifinalScores: Record<number, RoundScoreState>,
): MatchRound[] => {
  const finalists = semifinalRounds.map((round) =>
    getRoundWinner(round, semifinalScores[round.id] ?? emptyRoundScore()),
  );

  if (finalists.length < 2) {
    return [];
  }

  return [
    {
      id: 7,
      label: '决赛',
      players: [finalists[0], finalists[1]],
    },
  ];
};

const formatTotal = (value: number) => value.toLocaleString('zh-CN');

const pageTitle: Record<Page, string> = {
  home: '比赛控制首页',
  elimination: '淘汰赛控制',
  semifinal: '半决赛控制',
  final: '决赛控制',
};

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? '请求失败');
  }

  return payload as T;
}

const loadGroupSchedule = (group: GroupKey) =>
  requestJson<SchedulePayload>(`/api/groups/${group}/schedule`);

const writeWorkbookRound = (
  group: GroupKey,
  round: MatchRound,
  scoreState: RoundScoreState,
) =>
  requestJson<{
    ok: boolean;
    winnerIndex: number;
    totals: [number, number];
    scoreImages?: ScoreImages;
  }>(
    `/api/groups/${group}/round`,
    {
      method: 'POST',
      body: JSON.stringify({
        roundId: round.id,
        players: round.players,
        songCount: scoreState.showSongThree ? 3 : 2,
        songOne: scoreState.songOne,
        songTwo: scoreState.songTwo,
        songThree: scoreState.songThree,
      }),
    },
  );

const writeScoreImages = (
  group: GroupKey,
  round: MatchRound,
  scoreState: RoundScoreState,
) =>
  requestJson<{
    ok: boolean;
    scoreImages?: ScoreImages;
  }>(
    `/api/groups/${group}/score-images`,
    {
      method: 'POST',
      body: JSON.stringify({
        roundId: round.id,
        players: round.players,
        songCount: scoreState.showSongThree ? 3 : 2,
        songOne: scoreState.songOne,
        songTwo: scoreState.songTwo,
        songThree: scoreState.songThree,
      }),
    },
  );

const writeWorkbookAdvancement = (group: GroupKey, rounds: MatchRound[]) =>
  requestJson<{ok: boolean}>(`/api/groups/${group}/advance`, {
    method: 'POST',
    body: JSON.stringify({rounds}),
  });

const loadObsState = () => requestJson<ObsState>('/api/obs/state');

const setObsTransition = (transitionName: string) =>
  requestJson<ObsState>('/api/obs/transition', {
    method: 'POST',
    body: JSON.stringify({transitionName}),
  });

const setObsSceneItemEnabled = (
  sceneName: string,
  sceneItemId: number,
  sceneItemEnabled: boolean,
) =>
  requestJson<ObsState>('/api/obs/scene-item', {
    method: 'POST',
    body: JSON.stringify({sceneName, sceneItemId, sceneItemEnabled}),
  });

const setObsExclusiveSceneItems = (sceneName: string, visibleSourceNames: string[]) =>
  requestJson<ObsState>('/api/obs/exclusive-scene-items', {
    method: 'POST',
    body: JSON.stringify({sceneName, visibleSourceNames}),
  });

const setObsNamedSceneItemsEnabled = (
  sceneName: string,
  sourceNames: string[],
  sceneItemEnabled: boolean,
) =>
  requestJson<ObsState>('/api/obs/named-scene-items', {
    method: 'POST',
    body: JSON.stringify({sceneName, sourceNames, sceneItemEnabled}),
  });

const setObsScoreImageFiles = (paths: [string, string]) =>
  requestJson<ObsState>('/api/obs/score-image-files', {
    method: 'POST',
    body: JSON.stringify({paths}),
  });

const switchObsSceneWithTransition = (
  sceneName: string,
  transitionName = OBS_VIDEO_TRANSITION_NAME,
  restoreTransitionName?: string,
) =>
  requestJson<ObsState>('/api/obs/scene-with-transition', {
    method: 'POST',
    body: JSON.stringify({sceneName, transitionName, restoreTransitionName}),
  });

export default function App() {
  return window.location.pathname === '/clock' ? <ClockOverlay /> : <CompetitionApp />;
}

function CompetitionApp() {
  const [page, setPage] = useState<Page>('home');
  const [selectedGroup, setSelectedGroup] = useState<GroupKey | null>(null);
  const [loadedGroup, setLoadedGroup] = useState<GroupKey | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [rounds, setRounds] = useState<MatchRound[]>([]);
  const [roundScores, setRoundScores] = useState<Record<number, RoundScoreState>>({});
  const [semifinalRounds, setSemifinalRounds] = useState<MatchRound[]>([]);
  const [semifinalScores, setSemifinalScores] = useState<Record<number, RoundScoreState>>({});
  const [finalRounds, setFinalRounds] = useState<MatchRound[]>([]);
  const [finalScores, setFinalScores] = useState<Record<number, RoundScoreState>>({});
  const [obsState, setObsState] = useState<ObsState | null>(null);
  const [selectedObsScene, setSelectedObsScene] = useState('');
  const [obsLoadState, setObsLoadState] = useState<LoadState>('idle');
  const [obsMessage, setObsMessage] = useState('OBS 尚未连接。');
  const [shouldHideScoreImagesOnNextSceneSwitch, setShouldHideScoreImagesOnNextSceneSwitch] =
    useState(false);
  const scoreImagesHideTimerRef = useRef<number | null>(null);
  const [statusText, setStatusText] = useState('请选择组别，然后加载参赛者名单。');

  const canLoad = selectedGroup !== null && loadState !== 'loading';
  const isLoaded = loadState === 'loaded' && loadedGroup !== null;
  const canStartCompetition =
    isLoaded && selectedGroup === loadedGroup && participants.length === 8 && rounds.length === 4;
  const canStartSemifinals =
    rounds.length === 4 &&
    rounds.every((round) => roundScores[round.id]?.status === 'finished');
  const canStartFinals =
    semifinalRounds.length === 2 &&
    semifinalRounds.every((round) => semifinalScores[round.id]?.status === 'finished');
  const canReturnHomeFromFinal =
    finalRounds.length === 1 && finalScores[finalRounds[0].id]?.status === 'finished';

  const handleObsState = (state: ObsState) => {
    setObsState(state);
    setSelectedObsScene((currentScene) => {
      if (currentScene && state.scenes.some((scene) => scene.name === currentScene)) {
        return currentScene;
      }

      return state.currentScene ?? state.scenes[0]?.name ?? '';
    });
  };

  const refreshObsState = async (announce = true) => {
    setObsLoadState('loading');
    setObsMessage('正在连接 OBS...');

    try {
      const state = await loadObsState();
      handleObsState(state);
      setObsLoadState('loaded');
      setObsMessage(
        `OBS 已连接：${state.scenes.length} 个场景，${state.transitions.length} 个转场。`,
      );
      if (announce) {
        setStatusText(`OBS 可控信息已刷新，当前场景：${state.currentScene ?? '未知'}。`);
      }
    } catch (error) {
      setObsLoadState('idle');
      setObsMessage(error instanceof Error ? error.message : 'OBS 连接失败');
      if (announce) {
        setStatusText(error instanceof Error ? error.message : 'OBS 连接失败');
      }
    }
  };

  useEffect(() => {
    void refreshObsState(false);
  }, []);

  useEffect(
    () => () => {
      if (scoreImagesHideTimerRef.current !== null) {
        window.clearTimeout(scoreImagesHideTimerRef.current);
      }
    },
    [],
  );

  const clearScoreImagesHideTimer = () => {
    if (scoreImagesHideTimerRef.current === null) return;

    window.clearTimeout(scoreImagesHideTimerRef.current);
    scoreImagesHideTimerRef.current = null;
  };

  const hideObsScoreImages = async () => {
    clearScoreImagesHideTimer();
    const state = await setObsNamedSceneItemsEnabled(
      OBS_SCORE_SCENE_NAME,
      OBS_SCORE_IMAGE_SOURCE_NAMES,
      false,
    );
    handleObsState(state);
    setShouldHideScoreImagesOnNextSceneSwitch(false);
    return state;
  };

  const handleSwitchObsScene = async (sceneName: string) => {
    if (!sceneName) return false;

    const transitionName =
      sceneName === '上机' ? OBS_VIDEO_TRANSITION_NAME : OBS_FADE_TRANSITION_NAME;
    setObsLoadState('loading');
    setStatusText(`正在用“${transitionName}”切换 OBS 到“${sceneName}”...`);
    try {
      if (shouldHideScoreImagesOnNextSceneSwitch) {
        await hideObsScoreImages();
      }

      const state = await switchObsSceneWithTransition(sceneName, transitionName);
      handleObsState(state);
      setObsLoadState('loaded');
      setObsMessage(`当前 OBS 场景：${state.currentScene ?? sceneName}，转场：${transitionName}`);
      setStatusText(`OBS 已用“${transitionName}”切换到“${sceneName}”。`);
      return true;
    } catch (error) {
      setObsLoadState(obsState ? 'loaded' : 'idle');
      const message = error instanceof Error ? error.message : 'OBS 场景切换失败';
      setObsMessage(message);
      setStatusText(message);
      return false;
    }
  };

  const handleSwitchObsTransition = async (transitionName: string) => {
    if (!transitionName) return;

    setObsLoadState('loading');
    setStatusText(`正在切换 OBS 转场到“${transitionName}”...`);
    try {
      const state = await setObsTransition(transitionName);
      handleObsState(state);
      setObsLoadState('loaded');
      setObsMessage(`当前 OBS 转场：${state.currentTransition ?? transitionName}`);
      setStatusText(`OBS 转场已切换到“${transitionName}”。`);
    } catch (error) {
      setObsLoadState(obsState ? 'loaded' : 'idle');
      const message = error instanceof Error ? error.message : 'OBS 转场切换失败';
      setObsMessage(message);
      setStatusText(message);
    }
  };

  const handleToggleObsSceneItem = async (sceneName: string, item: ObsSceneItem) => {
    setObsLoadState('loading');
    setStatusText(`正在${item.enabled ? '隐藏' : '显示'}“${item.name}”...`);
    try {
      const state = await setObsSceneItemEnabled(sceneName, item.id, !item.enabled);
      handleObsState(state);
      setObsLoadState('loaded');
      setObsMessage(`“${item.name}”已${item.enabled ? '隐藏' : '显示'}。`);
      setStatusText(`OBS 素材“${item.name}”已${item.enabled ? '隐藏' : '显示'}。`);
    } catch (error) {
      setObsLoadState(obsState ? 'loaded' : 'idle');
      const message = error instanceof Error ? error.message : 'OBS 素材可见性切换失败';
      setObsMessage(message);
      setStatusText(message);
    }
  };

  const applyObsExclusiveItems = async (sceneName: string, visibleSourceNames: string[]) => {
    setObsLoadState('loading');
    try {
      const state = await setObsExclusiveSceneItems(sceneName, visibleSourceNames);
      handleObsState(state);
      setObsLoadState('loaded');
      return true;
    } catch (error) {
      setObsLoadState(obsState ? 'loaded' : 'idle');
      const message = error instanceof Error ? error.message : 'OBS 素材组切换失败';
      setObsMessage(message);
      return false;
    }
  };

  const showObsScoreImagesUntilNextSceneSwitch = async (
    scoreImages?: ScoreImages,
    autoHideMs?: number,
  ) => {
    clearScoreImagesHideTimer();
    setObsLoadState('loading');
    try {
      if (scoreImages) {
        await setObsScoreImageFiles(scoreImages.paths);
      }

      const state = await setObsNamedSceneItemsEnabled(
        OBS_SCORE_SCENE_NAME,
        OBS_SCORE_IMAGE_SOURCE_NAMES,
        true,
      );
      handleObsState(state);
      setObsLoadState('loaded');
      setShouldHideScoreImagesOnNextSceneSwitch(true);
      if (autoHideMs) {
        scoreImagesHideTimerRef.current = window.setTimeout(() => {
          void hideObsScoreImages()
            .then(() => {
              setObsMessage('OBS 成绩图已自动隐藏。');
            })
            .catch((error) => {
              const message = error instanceof Error ? error.message : 'OBS 成绩图自动隐藏失败';
              setObsMessage(message);
            });
        }, autoHideMs);
      }
      setObsMessage(
        autoHideMs
          ? `OBS 成绩图已显示，约 ${Math.round(autoHideMs / 1000)} 秒后自动隐藏。`
          : 'OBS 成绩图已显示，下次切换场景时会自动隐藏。',
      );
      return true;
    } catch (error) {
      setObsLoadState(obsState ? 'loaded' : 'idle');
      const message = error instanceof Error ? error.message : 'OBS 成绩图显示失败';
      setObsMessage(message);
      return false;
    }
  };

  const handleSelectGroup = (group: GroupKey) => {
    setSelectedGroup(group);
    if (loadState !== 'loading') {
      setStatusText(`已选择 ${group} 组，可以加载参赛者名单。`);
    }
  };

  const handleLoadParticipants = async () => {
    if (!selectedGroup) return;

    setLoadState('loading');
    setStatusText(`正在加载 ${selectedGroup} 组参赛者名单和淘汰赛回合...`);

    try {
      const schedule = await loadGroupSchedule(selectedGroup);
      setLoadedGroup(schedule.group);
      setParticipants(schedule.participants);
      setRounds(schedule.rounds);
      setRoundScores(createInitialScores(schedule.rounds));
      setSemifinalRounds([]);
      setSemifinalScores({});
      setFinalRounds([]);
      setFinalScores({});
      setPage('home');
      setLoadState('loaded');
      const obsUpdated = await applyObsExclusiveItems(OBS_GROUP_SCENE_NAME, [
        `${schedule.group}组`,
      ]);
      setStatusText(
        `${schedule.group} 组名单加载成功，已从表格读取 ${schedule.participants.length} 位选手和 ${schedule.rounds.length} 个淘汰赛回合。${
          obsUpdated
            ? `OBS “${OBS_GROUP_SCENE_NAME}”已只显示 ${schedule.group} 组。`
            : `OBS “${OBS_GROUP_SCENE_NAME}”同步失败。`
        }`,
      );
    } catch (error) {
      setLoadState(loadedGroup ? 'loaded' : 'idle');
      setStatusText(error instanceof Error ? error.message : '加载失败');
    }
  };

  const handleStartCompetition = async () => {
    if (!canStartCompetition) return;

    setPage('elimination');
    setStatusText(`${loadedGroup} 组淘汰赛控制页已打开，正在设置 OBS...`);
    const roundUpdated = await applyObsExclusiveItems(OBS_ROUND_SCENE_NAME, [
      OBS_ELIMINATION_ROUND_SOURCE_NAME,
    ]);
    const sceneUpdated = await handleSwitchObsScene('赛程');

    setStatusText(
      `${loadedGroup} 组淘汰赛控制页已打开。${
        roundUpdated ? 'OBS “轮数”已只显示淘汰赛。' : 'OBS “轮数”同步失败。'
      }${sceneUpdated ? 'OBS 已切换到赛程。' : 'OBS 场景切换失败。'}`,
    );
  };

  const handleStartSemifinals = async () => {
    if (!canStartSemifinals || !loadedGroup) return;

    const nextRounds = createSemifinalRounds(rounds, roundScores);
    try {
      setStatusText(`正在写入 ${loadedGroup} 组半决赛选手...`);
      await writeWorkbookAdvancement(loadedGroup, nextRounds);
      setStatusText(`正在设置 OBS 半决赛轮数与抽选场景...`);
      const roundUpdated = await applyObsExclusiveItems(OBS_ROUND_SCENE_NAME, [
        OBS_SEMIFINAL_ROUND_SOURCE_NAME,
      ]);
      const sceneUpdated = await handleSwitchObsScene('抽选');
      setSemifinalRounds(nextRounds);
      setSemifinalScores(createInitialScores(nextRounds));
      setPage('semifinal');
      setStatusText(
        `${loadedGroup} 组半决赛选手已写入表格。${
          roundUpdated ? 'OBS “轮数”已只显示半决赛。' : 'OBS “轮数”同步失败。'
        }${sceneUpdated ? 'OBS 已切换到抽选。' : 'OBS 场景切换失败。'}`,
      );
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '半决赛写入失败');
    }
  };

  const handleStartFinals = async () => {
    if (!canStartFinals || !loadedGroup) return;

    const nextRounds = createFinalRounds(semifinalRounds, semifinalScores);
    try {
      setStatusText(`正在写入 ${loadedGroup} 组决赛选手...`);
      await writeWorkbookAdvancement(loadedGroup, nextRounds);
      setStatusText(`正在设置 OBS 决赛轮数与抽选场景...`);
      const roundUpdated = await applyObsExclusiveItems(OBS_ROUND_SCENE_NAME, [
        OBS_FINAL_ROUND_SOURCE_NAME,
      ]);
      const sceneUpdated = await handleSwitchObsScene('抽选');
      setFinalRounds(nextRounds);
      setFinalScores(createInitialScores(nextRounds));
      setPage('final');
      setStatusText(
        `${loadedGroup} 组决赛选手已写入表格。${
          roundUpdated ? 'OBS “轮数”已只显示决赛。' : 'OBS “轮数”同步失败。'
        }${sceneUpdated ? 'OBS 已切换到抽选。' : 'OBS 场景切换失败。'}`,
      );
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '决赛写入失败');
    }
  };

  const handleReturnHomeFromFinal = async () => {
    if (!canReturnHomeFromFinal) return;

    setObsLoadState('loading');
    setStatusText(`正在用“${OBS_VIDEO_TRANSITION_NAME}”切回赛程...`);
    let obsUpdated = false;
    try {
      if (shouldHideScoreImagesOnNextSceneSwitch) {
        await hideObsScoreImages();
      }

      const state = await switchObsSceneWithTransition(
        '赛程',
        OBS_VIDEO_TRANSITION_NAME,
        OBS_FADE_TRANSITION_NAME,
      );
      handleObsState(state);
      setObsLoadState('loaded');
      setObsMessage(
        `OBS 已切回赛程，转场已恢复为“${OBS_FADE_TRANSITION_NAME}”。`,
      );
      obsUpdated = true;
    } catch (error) {
      setObsLoadState(obsState ? 'loaded' : 'idle');
      const message = error instanceof Error ? error.message : 'OBS 回到赛程失败';
      setObsMessage(message);
    }

    setPage('home');
    setStatusText(
      `${loadedGroup} 组决赛已结束，已返回比赛控制首页。${
        obsUpdated ? 'OBS 已用插入视频切回赛程并恢复淡入淡出。' : 'OBS 回到赛程失败。'
      }`,
    );
  };

  const handleShowFinalSongThree = async (roundId: number) => {
    if (!loadedGroup) return;

    const round = finalRounds.find((item) => item.id === roundId);
    if (!round) {
      setStatusText(`决赛 ${roundId} 未找到回合信息。`);
      return;
    }

    const scoreState = {
      ...(finalScores[roundId] ?? emptyRoundScore()),
      status: 'playing' as const,
      showSongTwo: true,
      showSongThree: false,
    };

    let scoreImagesVisible = false;
    try {
      setStatusText('正在生成前两首成绩图...');
      const result = await writeScoreImages(loadedGroup, round, scoreState);
      scoreImagesVisible = await showObsScoreImagesUntilNextSceneSwitch(
        result.scoreImages,
        OBS_TEMP_SCORE_IMAGE_DISPLAY_MS,
      );
    } catch (error) {
      setObsMessage(error instanceof Error ? error.message : '前两首成绩图显示失败');
    }

    showSongThree(setFinalScores, roundId, '决赛');
    setStatusText(
      `决赛 ${roundId} 已进入曲目 3。${
        scoreImagesVisible ? '前两首成绩图已显示约 5 秒。' : '前两首成绩图显示失败。'
      }`,
    );
  };

  const updateScore = (
    setScores: Dispatch<SetStateAction<Record<number, RoundScoreState>>>,
    roundId: number,
    song: ScoreSong,
    playerIndex: 0 | 1,
    value: string,
  ) => {
    setScores((currentScores) => {
      const currentRound = currentScores[roundId] ?? emptyRoundScore();
      const nextSongScores = [...currentRound[song]] as [string, string];
      nextSongScores[playerIndex] = value;

      return {
        ...currentScores,
        [roundId]: {
          ...currentRound,
          [song]: nextSongScores,
        },
      };
    });
  };

  const updateRoundScore = (
    roundId: number,
    song: ScoreSong,
    playerIndex: 0 | 1,
    value: string,
  ) => updateScore(setRoundScores, roundId, song, playerIndex, value);

  const updateSemifinalScore = (
    roundId: number,
    song: ScoreSong,
    playerIndex: 0 | 1,
    value: string,
  ) => updateScore(setSemifinalScores, roundId, song, playerIndex, value);

  const updateFinalScore = (
    roundId: number,
    song: ScoreSong,
    playerIndex: 0 | 1,
    value: string,
  ) => updateScore(setFinalScores, roundId, song, playerIndex, value);

  const startRound = (
    setScores: Dispatch<SetStateAction<Record<number, RoundScoreState>>>,
    roundId: number,
    stageName: string,
  ) => {
    setScores((currentScores) => ({
      ...currentScores,
      [roundId]: {
        ...(currentScores[roundId] ?? emptyRoundScore()),
        status: 'playing',
      },
    }));
    setStatusText(`${stageName} ${roundId} 已开始，可以录入曲目 1 成绩。`);
  };

  const showSongTwo = (
    setScores: Dispatch<SetStateAction<Record<number, RoundScoreState>>>,
    roundId: number,
    stageName: string,
  ) => {
    setScores((currentScores) => ({
      ...currentScores,
      [roundId]: {
        ...(currentScores[roundId] ?? emptyRoundScore()),
        status: 'playing',
        showSongTwo: true,
      },
    }));
    setStatusText(`${stageName} ${roundId} 已进入曲目 2。`);
  };

  const showSongThree = (
    setScores: Dispatch<SetStateAction<Record<number, RoundScoreState>>>,
    roundId: number,
    stageName: string,
  ) => {
    setScores((currentScores) => ({
      ...currentScores,
      [roundId]: {
        ...(currentScores[roundId] ?? emptyRoundScore()),
        status: 'playing',
        showSongTwo: true,
        showSongThree: true,
      },
    }));
    setStatusText(`${stageName} ${roundId} 已进入曲目 3。`);
  };

  const finishRound = async (
    setScores: Dispatch<SetStateAction<Record<number, RoundScoreState>>>,
    currentScores: Record<number, RoundScoreState>,
    stageRounds: MatchRound[],
    roundId: number,
    stageName: string,
    forceSongThree = false,
  ) => {
    if (!loadedGroup) return;

    const round = stageRounds.find((item) => item.id === roundId);
    if (!round) {
      setStatusText(`${stageName} ${roundId} 未找到回合信息。`);
      return;
    }

    const nextRoundState = {
      ...(currentScores[roundId] ?? emptyRoundScore()),
      status: 'finished' as const,
      showSongTwo: true,
      showSongThree: forceSongThree ? true : (currentScores[roundId] ?? emptyRoundScore()).showSongThree,
    };

    let scoreImagesVisible = false;
    try {
      setStatusText(`正在写入 ${stageName} ${roundId} 成绩并生成成绩图...`);
      const result = await writeWorkbookRound(loadedGroup, round, nextRoundState);
      scoreImagesVisible = await showObsScoreImagesUntilNextSceneSwitch(result.scoreImages);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : `${stageName} ${roundId} 写入失败`);
      return;
    }

    setScores((currentScores) => ({
      ...currentScores,
      [roundId]: nextRoundState,
    }));
    setStatusText(
      `${stageName} ${roundId} 已结束，成绩已写入表格和直播成绩图。${
        scoreImagesVisible ? 'OBS 成绩图已显示。' : 'OBS 成绩图显示失败。'
      }`,
    );
  };

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-[#20242c]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-[#d7dce8] pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#516070]">USTCop Livecast</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-[#161a20] sm:text-3xl">
              {pageTitle[page]}
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#516070]">
            {isLoaded ? (
              <CheckCircle2 className="h-4 w-4 text-[#1b8a5a]" aria-hidden="true" />
            ) : (
              <Clock3 className="h-4 w-4 text-[#657284]" aria-hidden="true" />
            )}
            <span>{statusText}</span>
          </div>
        </header>

        {page === 'home' ? (
          <HomePage
            canLoad={canLoad}
            canStartCompetition={canStartCompetition}
            isLoaded={isLoaded}
            loadedGroup={loadedGroup}
            loadState={loadState}
            obsLoadState={obsLoadState}
            obsMessage={obsMessage}
            obsState={obsState}
            onLoadParticipants={handleLoadParticipants}
            onRefreshObs={() => refreshObsState()}
            onSelectGroup={handleSelectGroup}
            onSelectObsScene={setSelectedObsScene}
            onStartCompetition={handleStartCompetition}
            onSwitchObsScene={handleSwitchObsScene}
            onSwitchObsTransition={handleSwitchObsTransition}
            onToggleObsSceneItem={handleToggleObsSceneItem}
            participants={participants}
            rounds={rounds}
            selectedGroup={selectedGroup}
            selectedObsScene={selectedObsScene}
          />
        ) : page === 'elimination' ? (
          <EliminationPage
            canStartSemifinals={canStartSemifinals}
            loadedGroup={loadedGroup}
            obsLoadState={obsLoadState}
            obsState={obsState}
            onBack={() => setPage('home')}
            onFinishRound={(roundId) =>
              finishRound(setRoundScores, roundScores, rounds, roundId, '淘汰赛回合')
            }
            onShowSongTwo={(roundId) => showSongTwo(setRoundScores, roundId, '淘汰赛回合')}
            onStartRound={(roundId) => startRound(setRoundScores, roundId, '淘汰赛回合')}
            onStartSemifinals={handleStartSemifinals}
            onSwitchObsScene={handleSwitchObsScene}
            onUpdateScore={updateRoundScore}
            roundScores={roundScores}
            rounds={rounds}
          />
        ) : page === 'semifinal' ? (
          <SemifinalPage
            canStartFinals={canStartFinals}
            loadedGroup={loadedGroup}
            obsLoadState={obsLoadState}
            obsState={obsState}
            onBack={() => setPage('elimination')}
            onFinishRound={(roundId) =>
              finishRound(setSemifinalScores, semifinalScores, semifinalRounds, roundId, '半决赛')
            }
            onShowSongTwo={(roundId) => showSongTwo(setSemifinalScores, roundId, '半决赛')}
            onStartRound={(roundId) => startRound(setSemifinalScores, roundId, '半决赛')}
            onStartFinals={handleStartFinals}
            onSwitchObsScene={handleSwitchObsScene}
            onUpdateScore={updateSemifinalScore}
            roundScores={semifinalScores}
            rounds={semifinalRounds}
          />
        ) : (
          <FinalPage
            canReturnHome={canReturnHomeFromFinal}
            loadedGroup={loadedGroup}
            obsLoadState={obsLoadState}
            obsState={obsState}
            onBack={() => setPage('semifinal')}
            onFinishRound={(roundId) =>
              finishRound(setFinalScores, finalScores, finalRounds, roundId, '决赛', true)
            }
            onReturnHome={handleReturnHomeFromFinal}
            onShowSongThree={handleShowFinalSongThree}
            onShowSongTwo={(roundId) => showSongTwo(setFinalScores, roundId, '决赛')}
            onStartRound={(roundId) => startRound(setFinalScores, roundId, '决赛')}
            onSwitchObsScene={handleSwitchObsScene}
            onUpdateScore={updateFinalScore}
            roundScores={finalScores}
            rounds={finalRounds}
          />
        )}
      </div>

      <ObsSceneBadge obsLoadState={obsLoadState} obsState={obsState} />
    </main>
  );
}

function ObsSceneBadge({
  obsLoadState,
  obsState,
}: {
  obsLoadState: LoadState;
  obsState: ObsState | null;
}) {
  const isLoading = obsLoadState === 'loading';
  const sceneText = obsState?.currentScene ?? (isLoading ? '读取中' : '未连接');

  return (
    <aside className="obs-scene-badge" aria-live="polite">
      <span className="obs-scene-badge-label">当前场景</span>
      <span className="obs-scene-badge-value">{sceneText}</span>
    </aside>
  );
}

function HomePage({
  canLoad,
  canStartCompetition,
  isLoaded,
  loadedGroup,
  loadState,
  obsLoadState,
  obsMessage,
  obsState,
  onLoadParticipants,
  onRefreshObs,
  onSelectGroup,
  onSelectObsScene,
  onStartCompetition,
  onSwitchObsScene,
  onSwitchObsTransition,
  onToggleObsSceneItem,
  participants,
  rounds,
  selectedGroup,
  selectedObsScene,
}: {
  canLoad: boolean;
  canStartCompetition: boolean;
  isLoaded: boolean;
  loadedGroup: GroupKey | null;
  loadState: LoadState;
  obsLoadState: LoadState;
  obsMessage: string;
  obsState: ObsState | null;
  onLoadParticipants: () => void;
  onRefreshObs: () => void;
  onSelectGroup: (group: GroupKey) => void;
  onSelectObsScene: (sceneName: string) => void;
  onStartCompetition: () => void;
  onSwitchObsScene: (sceneName: string) => void;
  onSwitchObsTransition: (transitionName: string) => void;
  onToggleObsSceneItem: (sceneName: string, item: ObsSceneItem) => void;
  participants: Participant[];
  rounds: MatchRound[];
  selectedGroup: GroupKey | null;
  selectedObsScene: string;
}) {
  return (
    <section className="grid flex-1 grid-cols-1 gap-5 py-5 lg:grid-cols-[minmax(320px,420px)_1fr]">
      <div className="flex flex-col gap-5">
        <section className="border border-[#d7dce8] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#2a6fbb]" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-[#161a20]">选择组别</h2>
          </div>

          <div className="mt-4 grid grid-cols-5 gap-2 sm:gap-3 lg:grid-cols-5">
            {groups.map((group) => {
              const isSelected = selectedGroup === group;

              return (
                <button
                  aria-pressed={isSelected}
                  className={[
                    'group-button',
                    isSelected ? 'group-button-selected' : '',
                  ].join(' ')}
                  disabled={loadState === 'loading'}
                  key={group}
                  onClick={() => onSelectGroup(group)}
                  type="button"
                >
                  {group}
                </button>
              );
            })}
          </div>

          <button
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 bg-[#2a6fbb] px-4 text-sm font-semibold text-white transition hover:bg-[#235f9f] disabled:cursor-not-allowed disabled:bg-[#aeb8c5]"
            disabled={!canLoad}
            onClick={onLoadParticipants}
            type="button"
          >
            {loadState === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Users className="h-4 w-4" aria-hidden="true" />
            )}
            加载参赛者名单
          </button>

          <button
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 bg-[#1f7a5a] px-4 text-sm font-semibold text-white transition hover:bg-[#186448] disabled:cursor-not-allowed disabled:bg-[#aeb8c5]"
            disabled={!canStartCompetition}
            onClick={onStartCompetition}
            type="button"
          >
            <Trophy className="h-4 w-4" aria-hidden="true" />
            开始比赛
          </button>
        </section>

        <SceneControlPanel
          isBusy={obsLoadState === 'loading'}
          message={obsMessage}
          obsState={obsState}
          onRefresh={onRefreshObs}
          onSelectScene={onSelectObsScene}
          onSwitchScene={onSwitchObsScene}
          onSwitchTransition={onSwitchObsTransition}
          onToggleSceneItem={onToggleObsSceneItem}
          selectedSceneName={selectedObsScene}
        />
      </div>

      <section className="flex min-h-[420px] flex-col border border-[#d7dce8] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 border-b border-[#e1e5ee] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#161a20]">参赛者名单</h2>
            <p className="mt-1 text-sm text-[#657284]">
              {loadedGroup ? `${loadedGroup} 组` : '等待加载'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="w-fit border border-[#d7dce8] px-3 py-1 text-sm font-medium text-[#516070]">
              {participants.length} / 8
            </span>
            <span className="w-fit border border-[#d7dce8] px-3 py-1 text-sm font-medium text-[#516070]">
              {rounds.length} 个回合
            </span>
          </div>
        </div>

        {isLoaded && participants.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {participants.map((participant) => (
              <article
                className="flex min-h-20 items-center gap-3 border border-[#e1e5ee] bg-[#fbfcff] p-3"
                key={`${loadedGroup}-${participant.number}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#e7f0fa] text-sm font-bold text-[#245f9f]">
                  {participant.number}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[#161a20]">
                    {participant.id}
                  </p>
                  <p className="mt-1 text-xs text-[#657284]">选手编号 {participant.number}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center py-10 text-center">
            <div>
              <Users className="mx-auto h-10 w-10 text-[#aeb8c5]" aria-hidden="true" />
              <p className="mt-3 text-base font-medium text-[#344052]">
                {isLoaded ? '当前组暂无参赛者数据' : '请先选择组别并加载名单'}
              </p>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

function SceneShortcutButton({
  disabled = false,
  isActive = false,
  sceneName,
  onSwitchScene,
}: {
  disabled?: boolean;
  isActive?: boolean;
  sceneName: string;
  onSwitchScene: (sceneName: string) => void;
}) {
  const Icon =
    sceneName === '赛程'
      ? RadioTower
      : sceneName === '抽选'
        ? Shuffle
        : sceneName === '等待'
          ? Clock3
          : sceneName === '开幕'
            ? Trophy
            : MonitorPlay;

  return (
    <button
      className={['action-button', isActive ? 'action-button-primary' : ''].join(' ')}
      disabled={disabled}
      onClick={() => onSwitchScene(sceneName)}
      type="button"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {sceneName}
    </button>
  );
}

function SceneControlPanel({
  isBusy,
  message,
  obsState,
  onRefresh,
  onSelectScene,
  onSwitchScene,
  onSwitchTransition,
  onToggleSceneItem,
  selectedSceneName,
}: {
  isBusy: boolean;
  message: string;
  obsState: ObsState | null;
  onRefresh: () => void;
  onSelectScene: (sceneName: string) => void;
  onSwitchScene: (sceneName: string) => void;
  onSwitchTransition: (transitionName: string) => void;
  onToggleSceneItem: (sceneName: string, item: ObsSceneItem) => void;
  selectedSceneName: string;
}) {
  const selectedScene = obsState?.scenes.find((scene) => scene.name === selectedSceneName);
  const hasConnection = Boolean(obsState?.connected);
  const availableSceneNames = new Set(obsState?.scenes.map((scene) => scene.name) ?? []);

  return (
    <section className="border border-[#d7dce8] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <MonitorPlay className="h-5 w-5 text-[#2a6fbb]" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-[#161a20]">场景控制</h2>
        </div>

        <button
          aria-label="刷新 OBS"
          className="icon-button shrink-0"
          disabled={isBusy}
          onClick={onRefresh}
          title="刷新 OBS"
          type="button"
        >
          <RefreshCw
            className={['h-5 w-5', isBusy ? 'animate-spin' : ''].join(' ')}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <SceneShortcutButton
          disabled={isBusy || (hasConnection && !availableSceneNames.has('赛程'))}
          isActive={obsState?.currentScene === '赛程'}
          sceneName="赛程"
          onSwitchScene={onSwitchScene}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <SceneShortcutButton
            disabled={isBusy || (hasConnection && !availableSceneNames.has('等待'))}
            isActive={obsState?.currentScene === '等待'}
            sceneName="等待"
            onSwitchScene={onSwitchScene}
          />
          <SceneShortcutButton
            disabled={isBusy || (hasConnection && !availableSceneNames.has('开幕'))}
            isActive={obsState?.currentScene === '开幕'}
            sceneName="开幕"
            onSwitchScene={onSwitchScene}
          />
        </div>

        <p className="text-sm text-[#657284]">{message}</p>

        <details className="obs-details">
          <summary>OBS 可控项</summary>

          <div className="mt-3 grid gap-3">
            <label className="grid gap-2 text-sm font-semibold text-[#344052]">
              <span>场景</span>
              <select
                className="control-select"
                disabled={isBusy || !hasConnection}
                onChange={(event) => onSelectScene(event.target.value)}
                value={selectedSceneName}
              >
                {obsState?.scenes.map((scene) => (
                  <option key={scene.name} value={scene.name}>
                    {scene.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="action-button action-button-primary"
              disabled={isBusy || !selectedSceneName}
              onClick={() => onSwitchScene(selectedSceneName)}
              type="button"
            >
              <MonitorPlay className="h-4 w-4" aria-hidden="true" />
              切换到所选场景
            </button>

            <div className="grid gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#344052]">
                <Eye className="h-4 w-4 text-[#2a6fbb]" aria-hidden="true" />
                <span>素材可见性</span>
              </div>

              <div className="grid max-h-56 gap-2 overflow-auto pr-1">
                {selectedScene?.items.length ? (
                  selectedScene.items.map((item) => (
                    <button
                      aria-pressed={item.enabled}
                      className={[
                        'scene-item-button',
                        item.enabled ? 'scene-item-button-enabled' : '',
                      ].join(' ')}
                      disabled={isBusy}
                      key={`${selectedScene.name}-${item.id}-${item.name}`}
                      onClick={() => onToggleSceneItem(selectedScene.name, item)}
                      type="button"
                    >
                      {item.enabled ? (
                        <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                      )}
                      <span className="min-w-0 truncate">{item.name}</span>
                    </button>
                  ))
                ) : (
                  <div className="border border-[#e1e5ee] bg-[#fbfcff] p-3 text-sm text-[#657284]">
                    暂无可显示素材
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#344052]">
                <SlidersHorizontal className="h-4 w-4 text-[#2a6fbb]" aria-hidden="true" />
                <span>转场方式</span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {obsState?.transitions.length ? (
                  obsState.transitions.map((transition) => (
                    <button
                      className={[
                        'action-button',
                        obsState.currentTransition === transition.name
                          ? 'action-button-primary'
                          : '',
                      ].join(' ')}
                      disabled={isBusy}
                      key={transition.name}
                      onClick={() => onSwitchTransition(transition.name)}
                      type="button"
                    >
                      {transition.name}
                    </button>
                  ))
                ) : (
                  <div className="border border-[#e1e5ee] bg-[#fbfcff] p-3 text-sm text-[#657284]">
                    暂无转场数据
                  </div>
                )}
              </div>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}

function EliminationPage({
  canStartSemifinals,
  loadedGroup,
  obsLoadState,
  obsState,
  onBack,
  onFinishRound,
  onShowSongTwo,
  onStartRound,
  onStartSemifinals,
  onSwitchObsScene,
  onUpdateScore,
  roundScores,
  rounds,
}: {
  canStartSemifinals: boolean;
  loadedGroup: GroupKey | null;
  obsLoadState: LoadState;
  obsState: ObsState | null;
  onBack: () => void;
  onFinishRound: (roundId: number) => void;
  onShowSongTwo: (roundId: number) => void;
  onStartRound: (roundId: number) => void;
  onStartSemifinals: () => void;
  onSwitchObsScene: (sceneName: string) => void;
  onUpdateScore: (
    roundId: number,
    song: ScoreSong,
    playerIndex: 0 | 1,
    value: string,
  ) => void;
  roundScores: Record<number, RoundScoreState>;
  rounds: MatchRound[];
}) {
  const isObsBusy = obsLoadState === 'loading';
  const hasObsConnection = Boolean(obsState?.connected);
  const availableSceneNames = new Set(obsState?.scenes.map((scene) => scene.name) ?? []);
  const isSceneUnavailable = (sceneName: string) =>
    isObsBusy || (hasObsConnection && !availableSceneNames.has(sceneName));

  return (
    <section className="flex flex-1 flex-col gap-5 py-5">
      <div className="flex flex-col gap-3 border border-[#d7dce8] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <button className="icon-button" onClick={onBack} type="button">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-[#161a20]">
              {loadedGroup ? `${loadedGroup} 组淘汰赛` : '淘汰赛'}
            </h2>
            <p className="mt-1 text-sm text-[#657284]">四个回合并列显示，可逐回合录入成绩。</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <SceneShortcutButton
            disabled={isSceneUnavailable('赛程')}
            isActive={obsState?.currentScene === '赛程'}
            sceneName="赛程"
            onSwitchScene={onSwitchObsScene}
          />
          <SceneShortcutButton
            disabled={isSceneUnavailable('抽选')}
            isActive={obsState?.currentScene === '抽选'}
            sceneName="抽选"
            onSwitchScene={onSwitchObsScene}
          />
          <SceneShortcutButton
            disabled={isSceneUnavailable('上机')}
            isActive={obsState?.currentScene === '上机'}
            sceneName="上机"
            onSwitchScene={onSwitchObsScene}
          />
          <button
            className="action-button action-button-primary"
            disabled={!canStartSemifinals}
            onClick={onStartSemifinals}
            type="button"
          >
            <Trophy className="h-4 w-4" aria-hidden="true" />
            半决赛
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {rounds.map((round) => (
          <RoundCard
            key={round.id}
            onFinishRound={onFinishRound}
            onShowSongTwo={onShowSongTwo}
            onStartRound={onStartRound}
            onUpdateScore={onUpdateScore}
            round={round}
            scoreState={roundScores[round.id] ?? emptyRoundScore()}
            stageLabel="淘汰赛"
          />
        ))}
      </div>
    </section>
  );
}

function SemifinalPage({
  canStartFinals,
  loadedGroup,
  obsLoadState,
  obsState,
  onBack,
  onFinishRound,
  onShowSongTwo,
  onStartRound,
  onStartFinals,
  onSwitchObsScene,
  onUpdateScore,
  roundScores,
  rounds,
}: {
  canStartFinals: boolean;
  loadedGroup: GroupKey | null;
  obsLoadState: LoadState;
  obsState: ObsState | null;
  onBack: () => void;
  onFinishRound: (roundId: number) => void;
  onShowSongTwo: (roundId: number) => void;
  onStartRound: (roundId: number) => void;
  onStartFinals: () => void;
  onSwitchObsScene: (sceneName: string) => void;
  onUpdateScore: (
    roundId: number,
    song: ScoreSong,
    playerIndex: 0 | 1,
    value: string,
  ) => void;
  roundScores: Record<number, RoundScoreState>;
  rounds: MatchRound[];
}) {
  const isObsBusy = obsLoadState === 'loading';
  const hasObsConnection = Boolean(obsState?.connected);
  const availableSceneNames = new Set(obsState?.scenes.map((scene) => scene.name) ?? []);
  const isSceneUnavailable = (sceneName: string) =>
    isObsBusy || (hasObsConnection && !availableSceneNames.has(sceneName));

  return (
    <section className="flex flex-1 flex-col gap-5 py-5">
      <div className="flex flex-col gap-3 border border-[#d7dce8] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <button className="icon-button" onClick={onBack} type="button">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-[#161a20]">
              {loadedGroup ? `${loadedGroup} 组半决赛` : '半决赛'}
            </h2>
            <p className="mt-1 text-sm text-[#657284]">两个回合并列显示，可逐回合录入成绩。</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <SceneShortcutButton
            disabled={isSceneUnavailable('赛程')}
            isActive={obsState?.currentScene === '赛程'}
            sceneName="赛程"
            onSwitchScene={onSwitchObsScene}
          />
          <SceneShortcutButton
            disabled={isSceneUnavailable('抽选')}
            isActive={obsState?.currentScene === '抽选'}
            sceneName="抽选"
            onSwitchScene={onSwitchObsScene}
          />
          <SceneShortcutButton
            disabled={isSceneUnavailable('上机')}
            isActive={obsState?.currentScene === '上机'}
            sceneName="上机"
            onSwitchScene={onSwitchObsScene}
          />
          <button
            className="action-button action-button-primary"
            disabled={!canStartFinals}
            onClick={onStartFinals}
            type="button"
          >
            <Trophy className="h-4 w-4" aria-hidden="true" />
            决赛
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rounds.map((round) => (
          <RoundCard
            key={round.id}
            onFinishRound={onFinishRound}
            onShowSongThree={undefined}
            onShowSongTwo={onShowSongTwo}
            onStartRound={onStartRound}
            onUpdateScore={onUpdateScore}
            round={round}
            scoreState={roundScores[round.id] ?? emptyRoundScore()}
            stageLabel="半决赛"
          />
        ))}
      </div>
    </section>
  );
}

function FinalPage({
  canReturnHome,
  loadedGroup,
  obsLoadState,
  obsState,
  onBack,
  onFinishRound,
  onReturnHome,
  onShowSongThree,
  onShowSongTwo,
  onStartRound,
  onSwitchObsScene,
  onUpdateScore,
  roundScores,
  rounds,
}: {
  canReturnHome: boolean;
  loadedGroup: GroupKey | null;
  obsLoadState: LoadState;
  obsState: ObsState | null;
  onBack: () => void;
  onFinishRound: (roundId: number) => void;
  onReturnHome: () => void;
  onShowSongThree: (roundId: number) => void;
  onShowSongTwo: (roundId: number) => void;
  onStartRound: (roundId: number) => void;
  onSwitchObsScene: (sceneName: string) => void;
  onUpdateScore: (
    roundId: number,
    song: ScoreSong,
    playerIndex: 0 | 1,
    value: string,
  ) => void;
  roundScores: Record<number, RoundScoreState>;
  rounds: MatchRound[];
}) {
  const isObsBusy = obsLoadState === 'loading';
  const hasObsConnection = Boolean(obsState?.connected);
  const availableSceneNames = new Set(obsState?.scenes.map((scene) => scene.name) ?? []);
  const isSceneUnavailable = (sceneName: string) =>
    isObsBusy || (hasObsConnection && !availableSceneNames.has(sceneName));

  return (
    <section className="flex flex-1 flex-col gap-5 py-5">
      <div className="flex flex-col gap-3 border border-[#d7dce8] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3">
          <button className="icon-button" onClick={onBack} type="button">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-[#161a20]">
              {loadedGroup ? `${loadedGroup} 组决赛` : '决赛'}
            </h2>
            <p className="mt-1 text-sm text-[#657284]">一个回合，三首曲目，结束后可回到第一页。</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <SceneShortcutButton
            disabled={isSceneUnavailable('赛程')}
            isActive={obsState?.currentScene === '赛程'}
            sceneName="赛程"
            onSwitchScene={onSwitchObsScene}
          />
          <SceneShortcutButton
            disabled={isSceneUnavailable('抽选')}
            isActive={obsState?.currentScene === '抽选'}
            sceneName="抽选"
            onSwitchScene={onSwitchObsScene}
          />
          <SceneShortcutButton
            disabled={isSceneUnavailable('上机')}
            isActive={obsState?.currentScene === '上机'}
            sceneName="上机"
            onSwitchScene={onSwitchObsScene}
          />
          <button
            className="action-button action-button-primary"
            disabled={!canReturnHome}
            onClick={onReturnHome}
            type="button"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            回到第一页
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,640px)]">
        {rounds.map((round) => (
          <RoundCard
            key={round.id}
            onFinishRound={onFinishRound}
            onShowSongThree={onShowSongThree}
            onShowSongTwo={onShowSongTwo}
            onStartRound={onStartRound}
            onUpdateScore={onUpdateScore}
            round={round}
            scoreState={roundScores[round.id] ?? emptyRoundScore()}
            songCount={3}
            stageLabel="决赛"
          />
        ))}
      </div>
    </section>
  );
}

function RoundCard({
  onFinishRound,
  onShowSongThree,
  onShowSongTwo,
  onStartRound,
  onUpdateScore,
  round,
  scoreState,
  songCount = 2,
  stageLabel,
}: {
  key?: number;
  onFinishRound: (roundId: number) => void;
  onShowSongThree?: (roundId: number) => void;
  onShowSongTwo: (roundId: number) => void;
  onStartRound: (roundId: number) => void;
  onUpdateScore: (
    roundId: number,
    song: ScoreSong,
    playerIndex: 0 | 1,
    value: string,
  ) => void;
  round: MatchRound;
  scoreState: RoundScoreState;
  songCount?: 2 | 3;
  stageLabel: string;
}) {
  const isPlaying = scoreState.status === 'playing';
  const isFinished = scoreState.status === 'finished';
  const totals = getRoundTotals(scoreState);
  const winnerIndex = totals[0] >= totals[1] ? 0 : 1;
  const shouldShowSongThree = songCount === 3 && scoreState.showSongThree;
  const canAddSongThree = songCount === 3 && scoreState.showSongTwo && !scoreState.showSongThree;
  const canFinish = songCount === 2 ? scoreState.showSongTwo : scoreState.showSongThree;

  return (
    <article className="flex min-h-[360px] flex-col border border-[#d7dce8] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#161a20]">{round.label}</h3>
          <p className="mt-1 text-xs text-[#657284]">{stageLabel}</p>
        </div>
        <span
          className={[
            'round-state',
            isFinished ? 'round-state-finished' : '',
            isPlaying ? 'round-state-playing' : '',
          ].join(' ')}
        >
          {isFinished ? '已结束' : isPlaying ? '进行中' : '未开始'}
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {round.players.map((player) => (
          <div className="player-row" key={`${round.id}-${player.number}`}>
            <span className="player-number">{player.number}</span>
            <span className="truncate text-sm font-semibold text-[#161a20]">{player.id}</span>
          </div>
        ))}
      </div>

      {scoreState.status === 'idle' ? (
        <button
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 bg-[#2a6fbb] px-4 text-sm font-semibold text-white transition hover:bg-[#235f9f]"
          onClick={() => onStartRound(round.id)}
          type="button"
        >
          <Trophy className="h-4 w-4" aria-hidden="true" />
          回合开始
        </button>
      ) : (
        <div className="mt-4 flex flex-1 flex-col gap-3">
          <ScoreInputRow
            disabled={isFinished}
            onUpdateScore={(playerIndex, value) =>
              onUpdateScore(round.id, 'songOne', playerIndex, value)
            }
            players={round.players}
            scores={scoreState.songOne}
            title="曲目 1"
          />

          {scoreState.showSongTwo && (
            <ScoreInputRow
              disabled={isFinished}
              onUpdateScore={(playerIndex, value) =>
                onUpdateScore(round.id, 'songTwo', playerIndex, value)
              }
              players={round.players}
              scores={scoreState.songTwo}
              title="曲目 2"
            />
          )}

          {shouldShowSongThree && (
            <ScoreInputRow
              disabled={isFinished}
              onUpdateScore={(playerIndex, value) =>
                onUpdateScore(round.id, 'songThree', playerIndex, value)
              }
              players={round.players}
              scores={scoreState.songThree}
              title="曲目 3"
            />
          )}

          <div className="mt-auto grid gap-2">
            {!scoreState.showSongTwo && (
              <button
                aria-label="添加曲目 2 成绩"
                className="icon-wide-button"
                onClick={() => onShowSongTwo(round.id)}
                type="button"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
              </button>
            )}

            {canAddSongThree && (
              <button
                aria-label="添加曲目 3 成绩"
                className="icon-wide-button"
                onClick={() => onShowSongThree?.(round.id)}
                type="button"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
              </button>
            )}

            {canFinish && !isFinished && (
              <button
                className="flex h-10 w-full items-center justify-center bg-[#1f7a5a] px-4 text-sm font-semibold text-white transition hover:bg-[#186448]"
                onClick={() => onFinishRound(round.id)}
                type="button"
              >
                结束
              </button>
            )}

            {isFinished && (
              <div className="grid grid-cols-2 gap-2 border-t border-[#e1e5ee] pt-3">
                {round.players.map((player, index) => (
                  <div
                    className={[
                      'total-box',
                      index === winnerIndex ? 'total-box-winner' : '',
                    ].join(' ')}
                    key={`${round.id}-${player.number}-total`}
                  >
                    <p className="truncate text-xs text-[#657284]">{player.id}</p>
                    <p className="mt-1 text-lg font-bold text-[#161a20]">
                      {formatTotal(totals[index])}
                    </p>
                    {index === winnerIndex && (
                      <p className="mt-1 text-xs font-semibold text-[#176448]">胜出</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function ScoreInputRow({
  disabled,
  onUpdateScore,
  players,
  scores,
  title,
}: {
  disabled: boolean;
  onUpdateScore: (playerIndex: 0 | 1, value: string) => void;
  players: [Participant, Participant];
  scores: [string, string];
  title: string;
}) {
  return (
    <section className="border border-[#e1e5ee] bg-[#fbfcff] p-3">
      <h4 className="text-sm font-semibold text-[#344052]">{title}</h4>
      <div className="mt-3 grid gap-2">
        {players.map((player, index) => (
          <label className="score-line" key={`${title}-${player.number}`}>
            <span className="min-w-0 truncate text-sm text-[#516070]">
              {player.number}. {player.id}
            </span>
            <input
              className="score-input"
              disabled={disabled}
              inputMode="decimal"
              min="0"
              onChange={(event) => onUpdateScore(index as 0 | 1, event.target.value)}
              placeholder="成绩"
              step="0.0001"
              type="number"
              value={scores[index]}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

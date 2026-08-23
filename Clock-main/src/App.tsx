import {useMemo, useState} from 'react';
import type {Dispatch, SetStateAction} from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Loader2,
  MonitorPlay,
  Plus,
  RadioTower,
  Shuffle,
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

const groups: GroupKey[] = ['A', 'B', 'C', 'D', 'E'];

const participantsByGroup: Record<GroupKey, Participant[]> = {
  A: [
    {number: '1', id: 'HaiT520'},
    {number: '2', id: 'dier4136'},
    {number: '3', id: 'F.riP'},
    {number: '4', id: 'Meph4786'},
    {number: '5', id: 'Re:owp'},
    {number: '6', id: 'Witch'},
    {number: '7', id: 'Yachie'},
    {number: '8', id: 'ItzBedLA'},
  ],
  B: [
    {number: '1', id: 'wx1fan'},
    {number: '2', id: 'MJM'},
    {number: '3', id: 'Frisk'},
    {number: '4', id: 'Veritas'},
    {number: '5', id: 'HIKARY_X'},
    {number: '6', id: 'Fore'},
    {number: '7', id: 'DeFinity'},
    {number: '8', id: 'Ryougetu'},
  ],
  C: [
    {number: '1', id: 'hanser66'},
    {number: '2', id: 'MISAKA'},
    {number: '3', id: 'Cravus'},
    {number: '4', id: 'KNRUZ'},
    {number: '5', id: 'TSUGUMI'},
    {number: '6', id: 'thriceee'},
    {number: '7', id: 'c0lD1Nk'},
    {number: '8', id: 'ZZZZZZZZ'},
  ],
  D: [
    {number: '1', id: 'C4＿plant'},
    {number: '2', id: 'AAAAAAAA'},
    {number: '3', id: 'yzsb2333'},
    {number: '4', id: 'LEMONWAT'},
    {number: '5', id: 'TwlitV'},
    {number: '6', id: 'c7H5NO3S'},
    {number: '7', id: 'rainbow'},
    {number: '8', id: '２ｂａ３'},
  ],
  E: [],
};

const placeholderActions = {
  schedule: '已选择切换到“赛程”场景，OBS 对接稍后实现。',
  waiting: '已点击“等待”，跳转功能稍后实现。',
  opening: '已点击“开幕”，跳转功能稍后实现。',
  draw: '已点击“抽选”，场景功能稍后实现。',
  machine: '已点击“上机”，场景功能稍后实现。',
};

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

const createEliminationRounds = (participants: Participant[]): MatchRound[] => {
  const pairings = [
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];

  return pairings
    .filter(([firstIndex, secondIndex]) => participants[firstIndex] && participants[secondIndex])
    .map(([firstIndex, secondIndex], index) => ({
      id: index + 1,
      label: `回合 ${index + 1}`,
      players: [participants[firstIndex], participants[secondIndex]],
    }));
};

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
      id: index + 1,
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
      id: 1,
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

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [selectedGroup, setSelectedGroup] = useState<GroupKey | null>(null);
  const [loadedGroup, setLoadedGroup] = useState<GroupKey | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [rounds, setRounds] = useState<MatchRound[]>([]);
  const [roundScores, setRoundScores] = useState<Record<number, RoundScoreState>>({});
  const [semifinalRounds, setSemifinalRounds] = useState<MatchRound[]>([]);
  const [semifinalScores, setSemifinalScores] = useState<Record<number, RoundScoreState>>({});
  const [finalRounds, setFinalRounds] = useState<MatchRound[]>([]);
  const [finalScores, setFinalScores] = useState<Record<number, RoundScoreState>>({});
  const [statusText, setStatusText] = useState('请选择组别，然后加载参赛者名单。');

  const participants = useMemo(
    () => (loadedGroup ? participantsByGroup[loadedGroup] : []),
    [loadedGroup],
  );

  const canLoad = selectedGroup !== null && loadState !== 'loading';
  const isLoaded = loadState === 'loaded' && loadedGroup !== null;
  const canStartCompetition = isLoaded && participants.length > 0 && rounds.length === 4;
  const canStartSemifinals =
    rounds.length === 4 &&
    rounds.every((round) => roundScores[round.id]?.status === 'finished');
  const canStartFinals =
    semifinalRounds.length === 2 &&
    semifinalRounds.every((round) => semifinalScores[round.id]?.status === 'finished');
  const canReturnHomeFromFinal =
    finalRounds.length === 1 && finalScores[finalRounds[0].id]?.status === 'finished';

  const handleSelectGroup = (group: GroupKey) => {
    setSelectedGroup(group);
    setLoadedGroup(null);
    setLoadState('idle');
    setRounds([]);
    setRoundScores({});
    setSemifinalRounds([]);
    setSemifinalScores({});
    setFinalRounds([]);
    setFinalScores({});
    setPage('home');
    setStatusText(`已选择 ${group} 组，可以加载参赛者名单。`);
  };

  const handleLoadParticipants = () => {
    if (!selectedGroup) return;

    setLoadState('loading');
    setStatusText(`正在加载 ${selectedGroup} 组参赛者名单和淘汰赛回合...`);

    window.setTimeout(() => {
      const nextParticipants = participantsByGroup[selectedGroup];
      const nextRounds = createEliminationRounds(nextParticipants);

      setLoadedGroup(selectedGroup);
      setRounds(nextRounds);
      setRoundScores(createInitialScores(nextRounds));
      setSemifinalRounds([]);
      setSemifinalScores({});
      setFinalRounds([]);
      setFinalScores({});
      setLoadState('loaded');
      setStatusText(
        nextParticipants.length > 0
          ? `${selectedGroup} 组名单加载成功，已生成 ${nextRounds.length} 个淘汰赛回合。`
          : `${selectedGroup} 组名单加载成功，当前暂无参赛者数据。`,
      );
    }, 450);
  };

  const handleStartCompetition = () => {
    if (!canStartCompetition) return;

    setPage('elimination');
    setStatusText(`${loadedGroup} 组淘汰赛控制页已打开。`);
  };

  const handleStartSemifinals = () => {
    if (!canStartSemifinals) return;

    const nextRounds = createSemifinalRounds(rounds, roundScores);
    setSemifinalRounds(nextRounds);
    setSemifinalScores(createInitialScores(nextRounds));
    setPage('semifinal');
    setStatusText(`${loadedGroup} 组半决赛控制页已打开。`);
  };

  const handleStartFinals = () => {
    if (!canStartFinals) return;

    const nextRounds = createFinalRounds(semifinalRounds, semifinalScores);
    setFinalRounds(nextRounds);
    setFinalScores(createInitialScores(nextRounds));
    setPage('final');
    setStatusText(`${loadedGroup} 组决赛控制页已打开。`);
  };

  const handleReturnHomeFromFinal = () => {
    if (!canReturnHomeFromFinal) return;

    setPage('home');
    setStatusText(`${loadedGroup} 组决赛已结束，已返回比赛控制首页。`);
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

  const finishRound = (
    setScores: Dispatch<SetStateAction<Record<number, RoundScoreState>>>,
    roundId: number,
    stageName: string,
  ) => {
    setScores((currentScores) => ({
      ...currentScores,
      [roundId]: {
        ...(currentScores[roundId] ?? emptyRoundScore()),
        status: 'finished',
        showSongTwo: true,
      },
    }));
    setStatusText(`${stageName} ${roundId} 已结束，总分已计算。`);
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
            onLoadParticipants={handleLoadParticipants}
            onSelectGroup={handleSelectGroup}
            onStartCompetition={handleStartCompetition}
            participants={participants}
            rounds={rounds}
            selectedGroup={selectedGroup}
            setStatusText={setStatusText}
          />
        ) : page === 'elimination' ? (
          <EliminationPage
            canStartSemifinals={canStartSemifinals}
            loadedGroup={loadedGroup}
            onBack={() => setPage('home')}
            onFinishRound={(roundId) => finishRound(setRoundScores, roundId, '淘汰赛回合')}
            onShowSongTwo={(roundId) => showSongTwo(setRoundScores, roundId, '淘汰赛回合')}
            onStartRound={(roundId) => startRound(setRoundScores, roundId, '淘汰赛回合')}
            onStartSemifinals={handleStartSemifinals}
            onUpdateScore={updateRoundScore}
            roundScores={roundScores}
            rounds={rounds}
            setStatusText={setStatusText}
          />
        ) : page === 'semifinal' ? (
          <SemifinalPage
            canStartFinals={canStartFinals}
            loadedGroup={loadedGroup}
            onBack={() => setPage('elimination')}
            onFinishRound={(roundId) => finishRound(setSemifinalScores, roundId, '半决赛')}
            onShowSongTwo={(roundId) => showSongTwo(setSemifinalScores, roundId, '半决赛')}
            onStartRound={(roundId) => startRound(setSemifinalScores, roundId, '半决赛')}
            onStartFinals={handleStartFinals}
            onUpdateScore={updateSemifinalScore}
            roundScores={semifinalScores}
            rounds={semifinalRounds}
            setStatusText={setStatusText}
          />
        ) : (
          <FinalPage
            canReturnHome={canReturnHomeFromFinal}
            loadedGroup={loadedGroup}
            onBack={() => setPage('semifinal')}
            onFinishRound={(roundId) => finishRound(setFinalScores, roundId, '决赛')}
            onReturnHome={handleReturnHomeFromFinal}
            onShowSongThree={(roundId) => showSongThree(setFinalScores, roundId, '决赛')}
            onShowSongTwo={(roundId) => showSongTwo(setFinalScores, roundId, '决赛')}
            onStartRound={(roundId) => startRound(setFinalScores, roundId, '决赛')}
            onUpdateScore={updateFinalScore}
            roundScores={finalScores}
            rounds={finalRounds}
            setStatusText={setStatusText}
          />
        )}
      </div>
    </main>
  );
}

function HomePage({
  canLoad,
  canStartCompetition,
  isLoaded,
  loadedGroup,
  loadState,
  onLoadParticipants,
  onSelectGroup,
  onStartCompetition,
  participants,
  rounds,
  selectedGroup,
  setStatusText,
}: {
  canLoad: boolean;
  canStartCompetition: boolean;
  isLoaded: boolean;
  loadedGroup: GroupKey | null;
  loadState: LoadState;
  onLoadParticipants: () => void;
  onSelectGroup: (group: GroupKey) => void;
  onStartCompetition: () => void;
  participants: Participant[];
  rounds: MatchRound[];
  selectedGroup: GroupKey | null;
  setStatusText: (statusText: string) => void;
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

        <section className="border border-[#d7dce8] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2">
            <MonitorPlay className="h-5 w-5 text-[#2a6fbb]" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-[#161a20]">场景控制</h2>
          </div>

          <div className="mt-4 grid gap-3">
            <button
              className="action-button action-button-primary"
              disabled={!isLoaded}
              onClick={() => setStatusText(placeholderActions.schedule)}
              type="button"
            >
              <RadioTower className="h-4 w-4" aria-hidden="true" />
              OBS 到“赛程”
            </button>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <button
                className="action-button"
                onClick={() => setStatusText(placeholderActions.waiting)}
                type="button"
              >
                <Clock3 className="h-4 w-4" aria-hidden="true" />
                跳转到“等待”
              </button>
              <button
                className="action-button"
                onClick={() => setStatusText(placeholderActions.opening)}
                type="button"
              >
                <Trophy className="h-4 w-4" aria-hidden="true" />
                跳转到“开幕”
              </button>
            </div>
          </div>
        </section>
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

function EliminationPage({
  canStartSemifinals,
  loadedGroup,
  onBack,
  onFinishRound,
  onShowSongTwo,
  onStartRound,
  onStartSemifinals,
  onUpdateScore,
  roundScores,
  rounds,
  setStatusText,
}: {
  canStartSemifinals: boolean;
  loadedGroup: GroupKey | null;
  onBack: () => void;
  onFinishRound: (roundId: number) => void;
  onShowSongTwo: (roundId: number) => void;
  onStartRound: (roundId: number) => void;
  onStartSemifinals: () => void;
  onUpdateScore: (
    roundId: number,
    song: ScoreSong,
    playerIndex: 0 | 1,
    value: string,
  ) => void;
  roundScores: Record<number, RoundScoreState>;
  rounds: MatchRound[];
  setStatusText: (statusText: string) => void;
}) {
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
          <button
            className="action-button"
            onClick={() => setStatusText(placeholderActions.schedule)}
            type="button"
          >
            <RadioTower className="h-4 w-4" aria-hidden="true" />
            赛程
          </button>
          <button
            className="action-button"
            onClick={() => setStatusText(placeholderActions.draw)}
            type="button"
          >
            <Shuffle className="h-4 w-4" aria-hidden="true" />
            抽选
          </button>
          <button
            className="action-button"
            onClick={() => setStatusText(placeholderActions.machine)}
            type="button"
          >
            <MonitorPlay className="h-4 w-4" aria-hidden="true" />
            上机
          </button>
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
  onBack,
  onFinishRound,
  onShowSongTwo,
  onStartRound,
  onStartFinals,
  onUpdateScore,
  roundScores,
  rounds,
  setStatusText,
}: {
  canStartFinals: boolean;
  loadedGroup: GroupKey | null;
  onBack: () => void;
  onFinishRound: (roundId: number) => void;
  onShowSongTwo: (roundId: number) => void;
  onStartRound: (roundId: number) => void;
  onStartFinals: () => void;
  onUpdateScore: (
    roundId: number,
    song: ScoreSong,
    playerIndex: 0 | 1,
    value: string,
  ) => void;
  roundScores: Record<number, RoundScoreState>;
  rounds: MatchRound[];
  setStatusText: (statusText: string) => void;
}) {
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
          <button
            className="action-button"
            onClick={() => setStatusText(placeholderActions.schedule)}
            type="button"
          >
            <RadioTower className="h-4 w-4" aria-hidden="true" />
            赛程
          </button>
          <button
            className="action-button"
            onClick={() => setStatusText(placeholderActions.draw)}
            type="button"
          >
            <Shuffle className="h-4 w-4" aria-hidden="true" />
            抽选
          </button>
          <button
            className="action-button"
            onClick={() => setStatusText(placeholderActions.machine)}
            type="button"
          >
            <MonitorPlay className="h-4 w-4" aria-hidden="true" />
            上机
          </button>
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
  onBack,
  onFinishRound,
  onReturnHome,
  onShowSongThree,
  onShowSongTwo,
  onStartRound,
  onUpdateScore,
  roundScores,
  rounds,
  setStatusText,
}: {
  canReturnHome: boolean;
  loadedGroup: GroupKey | null;
  onBack: () => void;
  onFinishRound: (roundId: number) => void;
  onReturnHome: () => void;
  onShowSongThree: (roundId: number) => void;
  onShowSongTwo: (roundId: number) => void;
  onStartRound: (roundId: number) => void;
  onUpdateScore: (
    roundId: number,
    song: ScoreSong,
    playerIndex: 0 | 1,
    value: string,
  ) => void;
  roundScores: Record<number, RoundScoreState>;
  rounds: MatchRound[];
  setStatusText: (statusText: string) => void;
}) {
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
          <button
            className="action-button"
            onClick={() => setStatusText(placeholderActions.schedule)}
            type="button"
          >
            <RadioTower className="h-4 w-4" aria-hidden="true" />
            赛程
          </button>
          <button
            className="action-button"
            onClick={() => setStatusText(placeholderActions.draw)}
            type="button"
          >
            <Shuffle className="h-4 w-4" aria-hidden="true" />
            抽选
          </button>
          <button
            className="action-button"
            onClick={() => setStatusText(placeholderActions.machine)}
            type="button"
          >
            <MonitorPlay className="h-4 w-4" aria-hidden="true" />
            上机
          </button>
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
              inputMode="numeric"
              min="0"
              onChange={(event) => onUpdateScore(index as 0 | 1, event.target.value)}
              placeholder="成绩"
              type="number"
              value={scores[index]}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

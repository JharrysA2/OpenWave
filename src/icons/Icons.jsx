import React from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  MagnifyingGlass,
  House,
  MusicNote,
  ClockCounterClockwise,
  DownloadSimple,
  Plus,
  List,
  Trash,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  Heart,
  Shuffle,
  ArrowsClockwise,
  RepeatOnce,
  ListNumbers,
  ShareNetwork,
  Radio,
  Info,
  Gear,
  PencilSimple,
  Check,
  ArrowClockwise,
  Globe,
  Microphone,
  Image,
  Lock,
  LockOpen,
  Moon,
  Sun,
  PaintBrush,
  Cloud,
  BookOpen,
  HardDrive,
} from "@phosphor-icons/react";

// Phosphor Icons — professional, round, consistent
// weight="fill" makes icons bolder/thicker for a more substantial feel
export const Ic = {
  play: (s = 22) => <Play size={s} weight="fill" />,
  pause: (s = 22) => <Pause size={s} weight="fill" />,
  next: (s = 24) => <SkipForward size={s} weight="fill" />,
  prev: (s = 24) => <SkipBack size={s} weight="fill" />,
  search: <MagnifyingGlass size={16} weight="fill" />,
  home: <House size={18} weight="fill" />,
  music: <MusicNote size={18} weight="fill" />,
  history: (s = 18) => <ClockCounterClockwise size={s} weight="fill" />,
  download: (s = 18) => <DownloadSimple size={s} weight="fill" />,
  plus: <Plus size={15} weight="fill" />,
  list: <List size={18} weight="fill" />,
  trash: <Trash size={19} weight="fill" />,
  vol: (s = 20) => <SpeakerSimpleHigh size={s} weight="fill" />,
  volMute: (s = 20) => <SpeakerSimpleSlash size={s} weight="fill" />,
  heart: (filled, s = 18) => (
    <Heart size={s} weight="fill" color={filled ? "#f43f5e" : "currentColor"} />
  ),
  shuffle: (s = 24) => <Shuffle size={s} weight="fill" />,
  repeat: (s = 24) => <ArrowsClockwise size={s} weight="fill" />,
  repeatOne: (s = 24) => <RepeatOnce size={s} weight="fill" />,
  queue: <ListNumbers size={19} weight="fill" />,
  share: <ShareNetwork size={19} weight="fill" />,
  radio: <Radio size={19} weight="fill" />,
  info: <Info size={19} weight="fill" />,
  close: (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  ),
  gear: <Gear size={18} weight="fill" />,
  paintBrush: <PaintBrush size={18} weight="fill" />,
  edit: <PencilSimple size={17} weight="fill" />,
  check: <Check size={17} weight="fill" />,
  reload: <ArrowClockwise size={17} weight="fill" />,
  search2: <MagnifyingGlass size={17} weight="fill" />,
  globe: <Globe size={17} weight="fill" />,
  dots: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="12" cy="19" r="2.2" />
    </svg>
  ),
  mic: (s = 22) => <Microphone size={s} weight="fill" />,
  img: <Image size={18} weight="fill" />,
  waveIcon: (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M2 12 C2 12 4 6 6 12 C8 18 10 6 12 12 C14 18 16 6 18 12 C20 18 22 12 22 12" />
    </svg>
  ),
  crossfade: (s = 18) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ display: "block" }}
    >
      <path d="M2 9c1.5 0 3 1 4 3s2.5 3 4 3 2.5-1 4-3 2.5-3 4-3" />
      <path d="M2 15c1.5 0 3-1 4-3s2.5-3 4-3 2.5 1 4 3 2.5 3 4 3" />
    </svg>
  ),
  lock: (s = 16) => <Lock size={s} weight="fill" />,
  unlock: (s = 16) => <LockOpen size={s} weight="fill" />,
  moon: (s = 22) => <Moon size={s} weight="fill" />,
  sun: (s = 22) => <Sun size={s} weight="fill" />,
  cloud: (s = 22) => <Cloud size={s} weight="fill" />,
  bookOpen: (s = 18) => <BookOpen size={s} weight="fill" />,
  hardDrive: (s = 18) => <HardDrive size={s} weight="fill" />,
};

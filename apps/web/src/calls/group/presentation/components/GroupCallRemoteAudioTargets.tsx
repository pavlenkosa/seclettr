import { useMediaElementBinding } from "@/calls/shared/media/useMediaElementBinding";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";

import styles from "@/calls/group/presentation/GroupCallPanel.module.css";

function GroupCallRemoteAudioSink({ stream }: { readonly stream: MediaStream }) {
  const { elementRef } = useMediaElementBinding<HTMLAudioElement>({
    kind: "audio",
    stream,
  });

  return (
    <audio
      ref={elementRef}
      className={styles.hiddenAudio}
      autoPlay
      aria-hidden="true"
      tabIndex={-1}
      data-testid="group-call-remote-audio-target"
    >
      <track kind="captions" />
    </audio>
  );
}

interface GroupCallRemoteAudioTargetsProps {
  readonly remoteMedia: GroupCallRemoteMedia[];
}

export function GroupCallRemoteAudioTargets({
  remoteMedia,
}: GroupCallRemoteAudioTargetsProps) {
  const audioParticipants = remoteMedia.filter(
    (participant): participant is GroupCallRemoteMedia & { audioStream: MediaStream } => (
      participant.audioStream !== null
    )
  );

  if (audioParticipants.length === 0) {
    return null;
  }

  return (
    <>
      {audioParticipants.map((participant) => (
        <GroupCallRemoteAudioSink
          key={`${participant.mediaId}:audio`}
          stream={participant.audioStream}
        />
      ))}
    </>
  );
}

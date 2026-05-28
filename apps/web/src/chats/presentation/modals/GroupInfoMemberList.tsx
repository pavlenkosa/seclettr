import { Avatar, EntityRow, LabelPill } from "@/components/ui";
import { normalizeRole, type GroupInfoMember } from "./group-info-modal-shared";

interface GroupInfoMemberListProps {
  readonly members: readonly GroupInfoMember[];
  readonly myUserId: string;
  readonly busyMemberId: string | null;
  readonly onSelectMember: (userId: string) => void;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

export function GroupInfoMemberList({
  members,
  myUserId,
  busyMemberId,
  onSelectMember,
  t,
}: GroupInfoMemberListProps) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {members.map((member) => {
        const role = normalizeRole(member.role);
        const isSelf = member.userId === myUserId;
        const showRoleBadge = role !== "member";

        return (
          <li key={member.userId}>
            <EntityRow
              leading={<Avatar label={member.username} size={42} fontSize="0.9rem" ariaHidden />}
              title={
                <>
                  @{member.username}
                  {isSelf ? (
                    <LabelPill size="xs" tone="default" style={{ marginLeft: "0.4rem" }}>
                      {t("group.members.you")}
                    </LabelPill>
                  ) : null}
                </>
              }
              meta={showRoleBadge ? (
                <LabelPill size="xs" tone={role === "owner" ? "warning" : "default"}>
                  {t(`group.members.role.${role}`)}
                </LabelPill>
              ) : null}
              size="md"
              onClick={() => onSelectMember(member.userId)}
              disabled={busyMemberId === member.userId}
            />
          </li>
        );
      })}
    </ul>
  );
}

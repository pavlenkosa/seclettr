import { buildGroupCallPanelChromeViewProps } from "@/calls/group/presentation/buildGroupCallPanelChromeViewProps";
import { buildGroupCallPanelControlsViewProps } from "@/calls/group/presentation/buildGroupCallPanelControlsViewProps";
import { buildGroupCallPanelMediaDetailsViewProps } from "@/calls/group/presentation/buildGroupCallPanelMediaDetailsViewProps";
import type {
  GroupCallPanelViewPropsBuildParams,
  GroupCallPanelViewPropsResult,
} from "@/calls/group/presentation/group-call-panel-view-props-contract";

export function buildGroupCallPanelViewProps({
  ...params
}: GroupCallPanelViewPropsBuildParams): GroupCallPanelViewPropsResult {
  const chromeProps = buildGroupCallPanelChromeViewProps(params);
  const mediaDetailsProps = buildGroupCallPanelMediaDetailsViewProps(params);

  return {
    ...chromeProps,
    ...mediaDetailsProps,
    controlsProps: buildGroupCallPanelControlsViewProps(params),
  };
}

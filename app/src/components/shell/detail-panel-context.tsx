import { createContext, useContext } from "react";

/**
 * Context providing the DOM element where the detail panel should be rendered.
 * AIBoard uses createPortal to render into this container, allowing the panel
 * to live at the app layout level (full-height, next to sidebar) while the
 * panel logic stays inside AIBoard.
 */
const DetailPanelContext = createContext<HTMLDivElement | null>(null);

export const DetailPanelProvider = DetailPanelContext.Provider;

export function useDetailPanelContainer() {
  return useContext(DetailPanelContext);
}

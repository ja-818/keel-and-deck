/**
 * Pair Device dialog — scan-only UX for non-technical users.
 *
 * What they see:
 *   • A short friendly sentence
 *   • The QR code (that's it)
 *   • A subtle "your Mac must stay open" note with a pointer to Always On
 *
 * What we hide: the literal access secret and the full URL. The QR is stable
 * until the user resets phone access in Settings, so rescanning from another
 * phone or a reopened browser tab works without generating throwaway codes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { QRCodeSVG } from "qrcode.react";
import { Phone } from "lucide-react";
import { tauriTunnel } from "../../lib/tauri";
import { logger } from "../../lib/logger";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface Pairing {
  code: string;
}

interface TunnelInfo {
  connected: boolean;
  publicHost: string | null;
}

/** Poll tunnel status while the dialog is open. 2s is fast enough that
 * "Connecting…" → "Connected" feels live; slow enough to not spam the
 * engine. */
const STATUS_POLL_MS = 2_000;
export function PairDeviceDialog({ isOpen, onClose }: Props) {
  const { t } = useTranslation("shell");
  const [info, setInfo] = useState<TunnelInfo | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const s = await tauriTunnel.status();
      setInfo({ connected: s.connected, publicHost: s.publicHost });
    } catch (e) {
      logger.warn("tunnel.status failed", String(e));
    }
  }, []);

  const mintCode = useCallback(async () => {
    try {
      const p = await tauriTunnel.mintPairingCode();
      setPairing({ code: p.code });
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /tunnel allocation|tunnel not configured/i.test(msg)
          ? t("pairDevice.errors.noInternet")
          : t("pairDevice.errors.generic"),
      );
    }
  }, [t]);

  // While the dialog is open: poll tunnel status every STATUS_POLL_MS so
  // the UI reflects connection drops live. Wait until the tunnel is connected
  // before showing the QR so a scan can complete immediately.
  useEffect(() => {
    if (!isOpen) {
      mountedRef.current = false;
      setPairing(null);
      setError(null);
      setInfo(null);
      return;
    }
    mountedRef.current = true;
    void loadStatus();
    const statusId = setInterval(() => {
      if (mountedRef.current) void loadStatus();
    }, STATUS_POLL_MS);
    return () => {
      clearInterval(statusId);
    };
  }, [isOpen, loadStatus, mintCode]);

  // Load the stable QR payload as soon as the tunnel comes up.
  useEffect(() => {
    if (!isOpen) return;
    if (info?.connected) {
      void mintCode();
    } else {
      setPairing(null);
    }
  }, [isOpen, info?.connected, mintCode]);

  const qrUrl =
    pairing && info?.connected && info.publicHost
      ? `${info.publicHost.startsWith("localhost") ? "http" : "https"}://${info.publicHost}/pair/${pairing.code}`
      : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Phone className="size-4" />
            <DialogTitle>{t("pairDevice.title")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("pairDevice.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-2">
          {qrUrl ? (
            <div className="rounded-xl border border-border/50 bg-white p-4">
              <QRCodeSVG
                value={qrUrl}
                size={220}
                level="M"
                bgColor="transparent"
                fgColor="#0d0d0d"
              />
            </div>
          ) : error ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-6 text-center text-sm text-destructive max-w-[240px]">
              {error}
            </div>
          ) : (
            <div className="size-[220px] rounded-xl bg-muted/40 animate-pulse flex items-center justify-center">
              <p className="text-[11px] text-muted-foreground text-center px-6 leading-relaxed">
                {t("pairDevice.loading")}
              </p>
            </div>
          )}
        </div>

        {info && !info.connected && !error && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-relaxed text-center">
            {t("pairDevice.connectingStatus")}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed text-center mt-1">
          {t("pairDevice.keepMacAwake")}
          <br />
          <Trans
            i18nKey="shell:pairDevice.alwaysOnHint"
            components={{ emph: <span className="underline underline-offset-2" /> }}
          />
        </p>
      </DialogContent>
    </Dialog>
  );
}

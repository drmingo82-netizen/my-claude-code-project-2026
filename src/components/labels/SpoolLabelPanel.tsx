import QRCode from 'qrcode';
import { QRCodeSVG } from 'qrcode.react';
import type { FilamentSpool } from '../../types';
import { filamentCostPerG } from '../../lib/metrics';
import { spoolQrUrl, buildPrintHtml } from '../../utils/scanUtils';

interface Props {
  spool: FilamentSpool;
}

export default function SpoolLabelPanel({ spool }: Props) {
  const url = spoolQrUrl(spool.id);
  const cpg = filamentCostPerG(spool);

  async function handleDownload() {
    const dataUrl = await QRCode.toDataURL(url, {
      width: 512,
      margin: 2,
      color: { dark: '#1e2a3a', light: '#ffffff' },
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${spool.brand}-${spool.material}-${spool.color}-qr.png`.replace(/\s+/g, '-');
    a.click();
  }

  async function handlePrint() {
    const qrDataUrl = await QRCode.toDataURL(url, { width: 256, margin: 1 });
    const html = buildPrintHtml(
      [
        {
          qrDataUrl,
          line1: `${spool.brand} ${spool.material}`,
          line2: spool.color,
          id: spool.id.slice(0, 12),
          meta: `$${cpg.toFixed(4)}/g`,
        },
      ],
      true,
    );
    const win = window.open('', '_blank');
    if (!win) { alert('Allow popups to print labels.'); return; }
    win.document.write(html);
    win.document.close();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 py-5 bg-slate-50 rounded-xl">
        <QRCodeSVG value={url} size={128} level="M" bgColor="#f8fafc" fgColor="#1e2a3a" />
        <div className="text-center space-y-0.5">
          <p className="text-sm font-semibold text-slate-800">
            {spool.brand} {spool.material} — {spool.color}
          </p>
          <p className="text-xs text-slate-500 font-mono">{spool.id.slice(0, 16)}…</p>
          <p className="text-xs text-slate-500">
            ${cpg.toFixed(4)}/g · {spool.weightRemainingG}g remaining
          </p>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 break-all text-center leading-relaxed">{url}</p>
      <div className="flex gap-3">
        <button
          onClick={handlePrint}
          className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Print Label
        </button>
        <button
          onClick={handleDownload}
          className="flex-1 py-2.5 rounded-lg bg-[#f97316] text-white text-sm font-medium hover:bg-[#ea6d0f] transition-colors"
        >
          ↓ Download QR
        </button>
      </div>
    </div>
  );
}

import QRCode from 'qrcode';
import { QRCodeSVG } from 'qrcode.react';
import type { Product } from '../../types';
import { productQrUrl, buildPrintHtml } from '../../utils/scanUtils';

interface Props {
  product: Product;
}

export default function ProductLabelPanel({ product }: Props) {
  const url = productQrUrl(product.id);

  async function handleDownload() {
    const dataUrl = await QRCode.toDataURL(url, {
      width: 512,
      margin: 2,
      color: { dark: '#1e2a3a', light: '#ffffff' },
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${product.sku}-qr.png`;
    a.click();
  }

  async function handlePrint() {
    const qrDataUrl = await QRCode.toDataURL(url, { width: 256, margin: 1 });
    const html = buildPrintHtml(
      [
        {
          qrDataUrl,
          line1: product.name.slice(0, 28),
          line2: product.sku,
          id: product.id.slice(0, 12),
          meta: `$${product.sellingPrice.toFixed(2)}`,
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
          <p className="text-sm font-semibold text-slate-800">{product.name}</p>
          <p className="text-xs text-slate-500 font-mono">{product.sku}</p>
          <p className="text-xs text-slate-500">ID: {product.id.slice(0, 16)}…</p>
          <p className="text-xs text-slate-500">Selling: ${product.sellingPrice.toFixed(2)}</p>
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

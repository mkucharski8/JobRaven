import PDFDocument from 'pdfkit';
import { type ExportColumn } from './exportOrderBook';
type PDFDoc = InstanceType<typeof PDFDocument>;
type OrderRow = Record<string, unknown>;
export declare function buildOrderBookPdf(doc: PDFDoc, orders: OrderRow[], columns: ExportColumn[], bookName: string | null, lang: 'pl' | 'en', vatRate: number, fonts: {
    normal: string;
    bold: string;
}, repertoriumLayout?: boolean): void;
export declare function writeOrderBookPdfToBuffer(orders: OrderRow[], columns: ExportColumn[], bookName: string | null, lang: 'pl' | 'en', vatRate: number, repertoriumLayout?: boolean): Promise<Buffer>;
export {};

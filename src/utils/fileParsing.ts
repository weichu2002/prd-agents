import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Ensure version is available, fallback to a stable 3.x version if strict mode obscures it
const pdfjsVersion = pdfjsLib.version || '3.11.174';
// Set worker source for PDF.js to matching CDN version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsVersion}/pdf.worker.min.js`;

export const parseFileToText = async (file: File): Promise<string> => {
    const fileType = file.type;

    try {
        if (fileType === 'application/pdf') {
            return await parsePdf(file);
        } else if (
            fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
            file.name.endsWith('.docx')
        ) {
            return await parseWord(file);
        } else if (fileType === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
            return await parseText(file);
        } else {
            // Basic fallback for other text-like files
            return await parseText(file);
        }
    } catch (error) {
        console.error("File parsing error:", error);
        throw new Error(`文件解析失败: ${(error as Error).message}`);
    }
};

const parseText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(new Error("读取文本文件失败"));
        reader.readAsText(file);
    });
};

const parsePdf = async (file: File): Promise<string> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += `\n\n## Page ${i}\n${pageText}`;
        }

        return fullText;
    } catch (e) {
        console.error("PDF Parse Error", e);
        throw new Error("PDF 解析失败，请检查文件是否损坏或加密");
    }
};

const parseWord = async (file: File): Promise<string> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    } catch (e) {
        console.error("Word Parse Error", e);
        throw new Error("Word 文档解析失败");
    }
};
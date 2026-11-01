import { Fragment } from 'react';

type Block =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

function localizeReport(markdown: string) {
  return markdown
    .replace(/\\([*_`#-])/g, '$1')
    .replace(/\\\s*\n/g, '\n')
    .replace(/Overall Sentiment\s*:/gi, 'Tâm lý tổng thể:')
    .replace(/Confidence\s*:/gi, 'Độ tin cậy:')
    .replace(/\bScore\s*:/gi, 'Điểm:')
    .replace(/\bRating\*{0,2}\s*:/gi, 'Xếp hạng:')
    .replace(/\*\*Action\*\*\s*:/gi, '**Hành động:**')
    .replace(/\*\*Reasoning\*\*\s*:/gi, '**Lý do:**')
    .replace(/\*\*Entry Price\*\*\s*:/gi, '**Giá vào lệnh:**')
    .replace(/\*\*Stop Loss\*\*\s*:/gi, '**Mức cắt lỗ:**')
    .replace(/\*\*Position Sizing\*\*\s*:/gi, '**Quy mô vị thế:**')
    .replace(/FINAL TRANSACTION PROPOSAL\s*:/gi, 'ĐỀ XUẤT GIAO DỊCH CUỐI CÙNG:')
    .replace(/\bMildly Bullish\b/gi, 'Hơi tích cực')
    .replace(/\bMildly Bearish\b/gi, 'Hơi tiêu cực')
    .replace(/\bBullish\b/gi, 'Tích cực')
    .replace(/\bBearish\b/gi, 'Tiêu cực')
    .replace(/\bNeutral\b/gi, 'Trung tính')
    .replace(/\bMixed\b/gi, 'Trái chiều')
    .replace(/\bOverweight\b/gi, 'Tăng tỷ trọng')
    .replace(/\bUnderweight\b/gi, 'Giảm tỷ trọng')
    .replace(/\bEqual Weight\b/gi, 'Ngang tỷ trọng')
    .replace(/\bnot provided\b/gi, 'chưa cung cấp')
    .replace(
      /(Độ tin cậy:\*{0,2}\s*)(High|Medium|Low)\b/gi,
      (_match, label: string, level: string) =>
        label + ({ high: 'Cao', medium: 'Trung bình', low: 'Thấp' }[level.toLowerCase()] ?? level),
    )
    .replace(/Hold\s*\/\s*wait for confirmation/gi, 'Giữ / chờ xác nhận')
    .replace(
      /(ĐỀ XUẤT GIAO DỊCH CUỐI CÙNG:\s*\*{0,2})(BUY|HOLD|SELL)(\*{0,2})/gi,
      (_match, prefix: string, action: string, suffix: string) =>
        `${prefix}${{ buy: 'MUA', hold: 'GIỮ', sell: 'BÁN' }[action.toLowerCase()] ?? action}${suffix}`,
    );
}

function blocksFrom(markdown: string): Block[] {
  const lines = localizeReport(markdown).replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list });
    list = [];
  };

  for (const line of lines) {
    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    const boldHeading = line.match(/^\s*\*\*(.+?)\*\*\s*$/);
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading || boldHeading) {
      flushParagraph();
      flushList();
      const rawText = heading?.[2] ?? boldHeading?.[1] ?? '';
      const headingLevel = heading?.[1]?.length === 1 ? 2 : 3;
      blocks.push({ type: 'heading', level: headingLevel, text: rawText });
    } else if (bullet) {
      flushParagraph();
      list.push(bullet[1] ?? '');
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

function inline(text: string) {
  const tokens = /(\*\*[^*]+\*\*|__[^_]+__|(?<!\*)\*[^*\n]+\*|(?<!_)_[^_\n]+_|`[^`]+`)/g;
  const output = [];
  let cursor = 0;
  for (const match of text.matchAll(tokens)) {
    const index = match.index ?? 0;
    if (index > cursor) output.push(text.slice(cursor, index));
    const token = match[0];
    if (token.startsWith('**') || token.startsWith('__')) {
      output.push(<strong key={index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      output.push(<code key={index}>{token.slice(1, -1)}</code>);
    } else {
      output.push(<em key={index}>{token.slice(1, -1)}</em>);
    }
    cursor = index + token.length;
  }
  if (cursor < text.length) output.push(text.slice(cursor));
  return output.map((part, index) => <Fragment key={index}>{part}</Fragment>);
}

export function MarkdownReport({ content }: { content: string }) {
  return (
    <div className="markdown-report">
      {blocksFrom(content).map((block, index) => {
        if (block.type === 'heading') {
          return block.level === 2 ? (
            <h2 key={index}>{inline(block.text)}</h2>
          ) : (
            <h3 key={index}>{inline(block.text)}</h3>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inline(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{inline(block.text)}</p>;
      })}
    </div>
  );
}

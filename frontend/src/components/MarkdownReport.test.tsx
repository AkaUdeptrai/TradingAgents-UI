import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MarkdownReport } from './MarkdownReport';

it('renders report headings, escaped emphasis, and bullet points as formatted content', () => {
  render(
    <MarkdownReport
      content={'**Tóm tắt**\n\nGiảm **một phần** tỷ trọng.\n\n\\- Giữ phần còn lại.'}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Tóm tắt' })).toBeInTheDocument();
  expect(screen.getByText('một phần').tagName).toBe('STRONG');
  expect(screen.getByRole('listitem')).toHaveTextContent('Giữ phần còn lại.');
});

it('localizes fixed sentiment and transaction labels while retaining Markdown formatting', () => {
  render(
    <MarkdownReport
      content={
        '**Overall Sentiment:** **Mildly Bullish** (Score: 5.8/10) **Confidence:** Medium\n\n**Rating:** Underweight\n\nFINAL TRANSACTION PROPOSAL: **Hold / wait for confirmation**'
      }
    />,
  );
  expect(screen.getByText('Tâm lý tổng thể:')).toBeInTheDocument();
  expect(screen.getByText('Hơi tích cực')).toBeInTheDocument();
  expect(screen.getByText(/Điểm: 5\.8\/10/)).toBeInTheDocument();
  expect(screen.getByText('Độ tin cậy:')).toBeInTheDocument();
  expect(screen.getByText(/Trung bình/)).toBeInTheDocument();
  expect(screen.getByText(/Giảm tỷ trọng/)).toBeInTheDocument();
  expect(screen.getByText('ĐỀ XUẤT GIAO DỊCH CUỐI CÙNG:')).toBeInTheDocument();
  expect(screen.getByText('Giữ / chờ xác nhận')).toBeInTheDocument();
});

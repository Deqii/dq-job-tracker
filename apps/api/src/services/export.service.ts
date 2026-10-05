import { ApplicationStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import type { Response } from 'express';

import type { ApplicationDto } from './application.service';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  [ApplicationStatus.WISHLIST]: 'Wishlist',
  [ApplicationStatus.APPLIED]: 'Applied',
  [ApplicationStatus.ASSESSMENT]: 'Assessment',
  [ApplicationStatus.INTERVIEW]: 'Interview',
  [ApplicationStatus.OFFER]: 'Offer',
  [ApplicationStatus.REJECTED]: 'Rejected',
  [ApplicationStatus.WITHDRAWN]: 'Withdrawn',
};

export async function writeApplicationsWorkbook(
  applications: ApplicationDto[],
  res: Response,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Job Application Tracker';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Applications');

  sheet.columns = [
    { header: 'Company', key: 'company', width: 24 },
    { header: 'Role', key: 'role', width: 32 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Applied', key: 'appliedAt', width: 14 },
    { header: 'Location', key: 'location', width: 20 },
    { header: 'Remote', key: 'isRemote', width: 9 },
    { header: 'Salary', key: 'salaryRange', width: 20 },
    { header: 'Resume', key: 'resumeVersion', width: 20 },
    { header: 'Posting URL', key: 'postingUrl', width: 42 },
    { header: 'Tags', key: 'tags', width: 26 },
    { header: 'Job Description', key: 'jobDescription', width: 70 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E7FF' },
  };
  headerRow.alignment = { vertical: 'middle' };

  for (const app of applications) {
    sheet.addRow({
      company: app.company?.name ?? '',
      role: app.roleTitle,
      status: STATUS_LABELS[app.currentStatus],
      appliedAt: new Date(app.appliedAt),
      location: app.location ?? '',
      isRemote: app.isRemote ? 'Yes' : '',
      salaryRange: app.salaryRange ?? '',
      resumeVersion: app.resumeVersion ?? '',
      postingUrl: app.postingUrl ?? '',
      tags: (app.tags ?? []).map((tag) => tag.name).join(', '),
      jobDescription: app.jobDescription,
    });
  }

  const lastRow = sheet.rowCount;
  if (lastRow > 1) {
    sheet.autoFilter = { from: `A1`, to: `${columnLetter(sheet.columnCount)}${lastRow}` };
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="applications-${dateStamp()}.xlsx"`,
  );
  await workbook.xlsx.write(res);
  res.end();
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function columnLetter(index: number): string {
  let column = '';
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    column = String.fromCharCode(65 + rem) + column;
    n = Math.floor((n - 1) / 26);
  }
  return column || 'A';
}
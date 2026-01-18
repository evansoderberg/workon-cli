import chalk from 'chalk';
import boxen from 'boxen';
import ora, { Ora } from 'ora';

export function createSpinner(text: string): Ora {
  return ora({ text, color: 'cyan' });
}

export function showBox(content: string, title?: string): void {
  console.log(boxen(content, {
    padding: 1,
    margin: { top: 1, bottom: 1, left: 0, right: 0 },
    borderColor: 'gray',
    title: title,
    titleAlignment: 'left',
  }));
}

export function showSuccess(message: string): void {
  console.log(chalk.green(`✓ ${message}`));
}

export function showError(message: string): void {
  console.log(chalk.red(`✗ ${message}`));
}

export function showWarning(message: string): void {
  console.log(chalk.yellow(`⚠ ${message}`));
}

export function showInfo(message: string): void {
  console.log(chalk.blue(`ℹ ${message}`));
}

export function formatPrStatus(status: {
  ciPassed: boolean;
  ciPending: number;
  ciFailed: string[];
  approvals: string[];
  changesRequested: string[];
}): string {
  const lines: string[] = [];

  // CI Status
  if (status.ciPassed && status.ciPending === 0) {
    lines.push(chalk.green('✓ CI: All checks passed'));
  } else {
    if (status.ciFailed.length > 0) {
      lines.push(chalk.red(`✗ CI: ${status.ciFailed.length} failed`));
      status.ciFailed.forEach(name => {
        lines.push(chalk.red(`    - ${name}`));
      });
    }
    if (status.ciPending > 0) {
      lines.push(chalk.yellow(`◔ CI: ${status.ciPending} pending`));
    }
  }

  // Review Status
  if (status.approvals.length > 0) {
    lines.push(chalk.green(`✓ Reviews: Approved by ${status.approvals.join(', ')}`));
  }
  if (status.changesRequested.length > 0) {
    lines.push(chalk.red(`✗ Reviews: Changes requested by ${status.changesRequested.join(', ')}`));
  }
  if (status.approvals.length === 0 && status.changesRequested.length === 0) {
    lines.push(chalk.yellow('◔ Reviews: Waiting for review'));
  }

  return lines.join('\n');
}

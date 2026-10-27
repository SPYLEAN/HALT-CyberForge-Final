import type * as React from 'react';
export interface HaltMarkProps { size?: number; decorative?: boolean; color?: string }
export declare function HaltMark(props: HaltMarkProps): React.ReactElement;
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'quiet' | 'ghost' | 'done'; trailing?: React.ReactNode; block?: boolean; reason?: string }
export declare function Button(props: ButtonProps): React.ReactElement;
export interface NavItem { id: string; label: string; index?: string; href?: string }
export interface NavProps { items: NavItem[]; active?: string; onSelect?: (id: string) => void; footer?: React.ReactNode; label?: string; height?: number | string }
export declare function Nav(props: NavProps): React.ReactElement;
export interface TabItem { id: string; label: string; count?: string | number }
export interface TabsProps { items: TabItem[]; value?: string; onChange?: (id: string) => void; label?: string }
export declare function Tabs(props: TabsProps): React.ReactElement;
export interface StatusChipProps { kind?: 'observed' | 'forecast' | 'blocked' | 'preserved' | 'verified' | 'success' | 'caution' | 'pending' | 'simulated' | 'neutral'; children?: React.ReactNode; className?: string }
export declare function StatusChip(props: StatusChipProps): React.ReactElement;
export interface MetricBlockProps { label: string; value: React.ReactNode; unit?: string; derivation: string; simulated?: boolean; tone?: 'threat' | 'business' }
export declare function MetricBlock(props: MetricBlockProps): React.ReactElement;
export interface EvidenceRowProps { id: string; source: string; text: string; time: string; supports?: string; href?: string; inferred?: boolean }
export declare function EvidenceRow(props: EvidenceRowProps): React.ReactElement;
export interface ConstraintIndicatorProps { name: string; rule: string; value: string; state?: 'met' | 'binding' | 'violated'; fill?: number; limit?: number }
export declare function ConstraintIndicator(props: ConstraintIndicatorProps): React.ReactElement;
export interface TimelineEventProps { time: string; kind?: 'observed' | 'forecast' | 'action'; title: string; description?: string; meta?: string; last?: boolean }
export declare function TimelineEvent(props: TimelineEventProps): React.ReactElement;
export interface ApprovalControlProps { name: string; role: string; short?: string; policy?: string; authorises?: string; impact?: string; reversibility?: string; authorisation?: string; state?: 'pending' | 'approved' | 'held'; at?: string; disabled?: boolean; onApprove?: () => void }
export declare function ApprovalControl(props: ApprovalControlProps): React.ReactElement;
export interface TooltipProps { content: React.ReactNode; title?: string; open?: boolean; children: React.ReactElement }
export declare function Tooltip(props: TooltipProps): React.ReactElement;
export interface DrawerProps { title: string; kicker?: string; open?: boolean; inline?: boolean; height?: number | string; onClose?: () => void; footer?: React.ReactNode; children?: React.ReactNode }
export declare function Drawer(props: DrawerProps): React.ReactElement | null;
export interface DialogProps { title: string; kicker?: string; open?: boolean; inline?: boolean; height?: number | string; onClose?: () => void; footer?: React.ReactNode; children?: React.ReactNode }
export declare function Dialog(props: DialogProps): React.ReactElement | null;
export interface ToastProps { kind?: 'neutral' | 'success' | 'caution' | 'threat'; title: string; onDismiss?: () => void; children?: React.ReactNode }
export declare function Toast(props: ToastProps): React.ReactElement;
export interface SkeletonProps { variant?: 'line' | 'block' | 'graph'; lines?: number; width?: number | string; height?: number | string; label?: string }
export declare function Skeleton(props: SkeletonProps): React.ReactElement;
export type NodeKind = 'user' | 'device' | 'session' | 'token' | 'application' | 'api' | 'service' | 'database' | 'process' | 'attacker';
export interface NodeGlyphProps { kind: NodeKind; state?: 'observed' | 'forecast' | 'inferred' | 'held' | 'verified'; size?: number; label?: string; caption?: boolean | string }
export declare function NodeGlyph(props: NodeGlyphProps): React.ReactElement;
export interface EdgeStrokeProps { kind: 'observed' | 'inferred' | 'forecast' | 'dependency' | 'blocked' | 'preserved'; width?: number; animate?: boolean }
export declare function EdgeStroke(props: EdgeStrokeProps): React.ReactElement;
declare global { interface Window { HALT: { HaltMark: typeof HaltMark; Button: typeof Button; Nav: typeof Nav; Tabs: typeof Tabs; StatusChip: typeof StatusChip; MetricBlock: typeof MetricBlock; EvidenceRow: typeof EvidenceRow; ConstraintIndicator: typeof ConstraintIndicator; TimelineEvent: typeof TimelineEvent; ApprovalControl: typeof ApprovalControl; Tooltip: typeof Tooltip; Drawer: typeof Drawer; Dialog: typeof Dialog; Toast: typeof Toast; Skeleton: typeof Skeleton; NodeGlyph: typeof NodeGlyph; EdgeStroke: typeof EdgeStroke } } }

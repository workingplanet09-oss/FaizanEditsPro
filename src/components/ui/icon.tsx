import {
  Activity, AlertCircle, AlertTriangle, ArrowRight, ArrowUpRight, Bell, Building2, Calendar, Camera, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clapperboard, Clock, Copy, CreditCard,
  Download, ExternalLink, Eye, FileText, Film, Folder, Gamepad2, Globe, GripVertical, HelpCircle, Home, Image as ImageIcon, Inbox, Info, Layers, LayoutDashboard, Link2, Loader2, Lock, LogOut, Mail, Megaphone, Menu, MessageSquare, Mic, Monitor, Moon,
  MoreHorizontal, Music, Palette, Pause, Pencil, Phone, Play, Plus, Receipt, RefreshCw, Repeat, Scissors, Search, Send, Settings, Share2, Shield, Smartphone, Sparkles, Star, Sun, Trash2, TrendingUp, Upload, User, Users, Video, Wand2, X, Zap,
  BarChart3, BookOpen, Briefcase, CalendarDays, CircleDollarSign, ClipboardList, FileSignature, FolderOpen, Gift, ListChecks, Newspaper, Package, PanelLeft, Quote, Rocket, Target, Timer, Wallet, Workflow, type LucideIcon,
} from "lucide-react";

/** Icon registry — services and CMS refer to icons by name (a string stored in the database). */
export const ICONS = {
  activity: Activity, alert: AlertCircle, warning: AlertTriangle, arrow: ArrowRight, "arrow-up-right": ArrowUpRight, bell: Bell, building: Building2, calendar: Calendar, camera: Camera, check: Check, "check-circle": CheckCircle2,
  "chevron-down": ChevronDown, "chevron-left": ChevronLeft, "chevron-right": ChevronRight, "chevron-up": ChevronUp, clapperboard: Clapperboard, clock: Clock, copy: Copy, card: CreditCard, download: Download, external: ExternalLink, eye: Eye, file: FileText,
  film: Film, folder: Folder, gamepad: Gamepad2, globe: Globe, grip: GripVertical, help: HelpCircle, home: Home, image: ImageIcon, inbox: Inbox, info: Info, layers: Layers, dashboard: LayoutDashboard, link: Link2, loader: Loader2, lock: Lock, logout: LogOut,
  mail: Mail, megaphone: Megaphone, menu: Menu, message: MessageSquare, mic: Mic, monitor: Monitor, moon: Moon, more: MoreHorizontal, music: Music, palette: Palette, pause: Pause, pencil: Pencil, phone: Phone, play: Play, plus: Plus, receipt: Receipt,
  refresh: RefreshCw, repeat: Repeat, scissors: Scissors, search: Search, send: Send, settings: Settings, share: Share2, shield: Shield, smartphone: Smartphone, sparkles: Sparkles, star: Star, sun: Sun, trash: Trash2, trending: TrendingUp, upload: Upload,
  user: User, users: Users, video: Video, wand: Wand2, x: X, youtube: zap: Zap, chart: BarChart3, book: BookOpen, briefcase: Briefcase, "calendar-days": CalendarDays, money: CircleDollarSign, clipboard: ClipboardList, sign: FileSignature,
  "folder-open": FolderOpen, gift: Gift, checklist: ListChecks, news: Newspaper, package: Package, panel: PanelLeft, quote: Quote, rocket: Rocket, target: Target, timer: Timer, wallet: Wallet, workflow: Workflow,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className, size = 18, strokeWidth = 1.75, ...rest }: { name: string; className?: string; size?: number; strokeWidth?: number } & React.AriaAttributes) {
  const C = (ICONS as Record<string, LucideIcon>)[name] ?? Sparkles;
  return <C className={className} size={size} strokeWidth={strokeWidth} aria-hidden={rest["aria-label"] ? undefined : true} {...rest} />;
}

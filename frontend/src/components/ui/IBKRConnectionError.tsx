
import { useState } from 'react';
import { Info, AlertCircle, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface IBKRConnectionErrorProps {
    error?: string;
    className?: string;
}

function isSafari(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
}

/**
 * Reusable component to show a professional IBKR connection error.
 * On Safari it shows a dedicated message explaining that the browser blocks
 * mixed-content requests to localhost (WebKit Bug 171934).
 */
export function IBKRConnectionError({ error, className }: IBKRConnectionErrorProps) {
    const { t } = useTranslation();
    const [showDetails, setShowDetails] = useState(false);
    const safari = isSafari();

    return (
        <Card glass className={cn("animate-fade-in border-destructive/20", className)}>
            <CardContent className="p-5">
                <div className="flex items-start gap-4">
                    <div className="p-2 rounded-full bg-destructive/10 text-destructive mt-0.5">
                        <AlertCircle className="w-5 h-5" />
                    </div>

                    <div className="flex-1 space-y-3">
                        <div>
                            <h3 className="text-sm font-semibold text-destructive">
                                {safari ? t('error.safariNotSupported') : t('error.ibkrDisconnected')}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                                {safari ? t('error.safariNotSupportedDescription') : t('error.ibkrDisconnectedDescription')}
                            </p>
                        </div>
                        
                        {!safari && (
                            <div className="flex mt-4 pt-4 border-t border-border/40">
                                <a
                                    href="/api/downloads/connector/latest"
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="inline-flex items-center justify-center gap-2 px-3 py-2 w-full sm:w-auto text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    {t('error.downloadConnector')}
                                </a>
                            </div>
                        )}
                        
                        {error && (
                            <div className="pt-2 border-t border-border/40">
                                <button
                                    onClick={() => setShowDetails(!showDetails)}
                                    className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors group"
                                >
                                    <div className="flex items-center justify-center w-4 h-4 rounded-full bg-secondary group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                        <Info className="w-2.5 h-2.5" />
                                    </div>
                                    <span>{t('error.technicalDetails')}</span>
                                    {showDetails ? (
                                        <ChevronUp className="w-3 h-3" />
                                    ) : (
                                        <ChevronDown className="w-3 h-3" />
                                    )}
                                </button>
                                
                                {showDetails && (
                                    <div className="mt-3 p-3 bg-black/20 rounded-lg border border-white/5 animate-slide-down">
                                        <code className="text-[10px] font-mono text-destructive/80 break-all whitespace-pre-wrap">
                                            {error}
                                        </code>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

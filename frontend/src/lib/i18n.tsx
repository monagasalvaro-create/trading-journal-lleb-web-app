/**
 * Lightweight i18n system for Trading Journal.
 * Supports English (en) and Spanish (es).
 * Language preference is persisted to localStorage.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

export type Lang = 'en' | 'es';

// ─── Translation Dictionaries ──────────────────────────────────────────────────

const translations: Record<Lang, Record<string, string>> = {
  en: {
    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.close': 'Close',
    'common.confirm': 'Confirm',
    'common.ok': 'OK',
    'common.test': 'Test',
    'common.retry': 'Retry',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.creating': 'Creating...',
    'common.saving': 'Saving...',

    // Sidebar
    'sidebar.appTitle': 'Trading Journal',
    'sidebar.appSubtitle': 'Pro Edition',
    'sidebar.nav.dashboard': 'Dashboard',
    'sidebar.nav.portfolio': 'Portfolio',
    'sidebar.nav.portfolioBoards': 'Portfolio Boards',
    'sidebar.nav.trades': 'Trades',
    'sidebar.nav.performanceAnalysis': 'Performance Analysis',
    'sidebar.nav.strikeCalculator': 'Strike Calculator',
    'sidebar.nav.settings': 'Settings',
    'sidebar.switchAccount': 'Switch Account',
    'sidebar.collapse': 'Collapse',
    'sidebar.lastSync': 'Last sync:',
    'sidebar.timeAgo.justNow': 'just now',
    'sidebar.timeAgo.minutesAgo': '{n}m ago',
    'sidebar.timeAgo.hoursAgo': '{n}h ago',
    'sidebar.timeAgo.daysAgo': '{n}d ago',

    // Dashboard
    'dashboard.title': 'Dashboard',
    'dashboard.accountBalance': 'Account Balance',
    'dashboard.monthlyPnl': '{month} {year} P&L',
    'dashboard.detailedStatistics': 'Detailed Statistics',
    'dashboard.filter.allTime': 'All Time',
    'dashboard.filter.ytd': 'YTD',
    'dashboard.filter.thisWeek': 'This Week',
    'dashboard.filter.month': 'Month',
    'dashboard.filter.thisQuarter': 'This Quarter',

    // KPI titles
    'kpi.winRate': 'Win Rate',
    'kpi.winningTrades': 'Winning Trades',
    'kpi.losingTrades': 'Losing Trades',
    'kpi.profitFactor': 'Profit Factor',
    'kpi.averageWin': 'Average Win',
    'kpi.averageLoss': 'Average Loss',
    'kpi.commissions': 'Commissions',
    'kpi.totalTrades': 'Total Trades',

    // Trade History
    'trades.title': 'Trade History',
    'trades.searchPlaceholder': 'Search trades...',
    'trades.col.date': 'Date',
    'trades.col.time': 'Time',
    'trades.col.ticker': 'Ticker',
    'trades.col.type': 'Type',
    'trades.col.qty': 'Qty',
    'trades.col.price': 'Price',
    'trades.col.strategy': 'Strategy',
    'trades.col.netPnl': 'Net P&L',
    'trades.col.commissions': 'Commissions',
    'trades.col.errorTag': 'Error Tag',
    'trades.noStrategy': '-- No Strategy --',
    'trades.selectStrategy': '-- Select --',
    'trades.otherStrategy': 'Otra Estrategia',
    'trades.pagination.showing': 'Showing {from} to {to} of {total} trades',
    'trades.pagination.page': 'Page {page} of {total}',
    'trades.barEdgeAlert.title': 'Bar-Edge Entry Detected',
    'trades.barEdgeAlert.description': 'This trade was entered during the final 5 minutes of a 30-minute bar (minutes :25–:29 or :55–:59). Entries near bar boundaries may indicate rushed decisions or chasing price action.',
    'trades.buyIndicator': 'Buy',
    'trades.strategyGroup.call': '📈 CALL Strategies',
    'trades.strategyGroup.put': '📉 PUT Strategies',
    'trades.strategyGroup.other': '⚡ Other',

    // Psychology Tags
    'psychTag.none': 'No Error',
    'psychTag.fomo': 'FOMO',
    'psychTag.revenge_trading': 'Revenge Trading',
    'psychTag.premature_exit': 'Premature Exit',
    'psychTag.rule_violation': 'Rule Violation',

    // Settings
    'settings.title': 'Settings',
    'settings.heading': 'Settings',
    'settings.description': 'Configure IBKR integration, account preferences, and appearance',
    'settings.section.accounts': 'Accounts',
    'settings.section.appearance': 'Appearance',
    'settings.section.ibkr': 'IBKR TWS API',
    'settings.section.portfolio': 'Portfolio Division',
    'settings.section.language': 'Language',
    'settings.section.general': 'General',
    'settings.theme.preference': 'Theme Preference',
    'settings.theme.light': 'Light',
    'settings.theme.dark': 'Dark',
    'settings.socketPort': 'Socket Port',
    'settings.socketPortDescription': 'Required for Portfolio, Portfolio Boards (real-time), and Strike Calculator.',
    'settings.stocks': 'Stocks',
    'settings.options': 'Options',
    'settings.saveButton': 'Save Settings',
    'settings.language.title': 'Application Language',
    'settings.language.english': 'English',
    'settings.language.spanish': 'Español',
    'settings.resetOnboarding.title': 'Welcome Tour',
    'settings.resetOnboarding.description': 'Show the welcome message and initial setup guide again.',
    'settings.resetOnboarding.button': 'Restart Tour',

    // Account Manager
    'accountManager.credentialsSaved': 'Credentials are saved. Enter new values to update them.',
    'accountManager.credentialsEmpty': 'Enter your IBKR Flex credentials to enable data sync.',
    'accountManager.flexToken': 'Flex Token',
    'accountManager.queryId': 'Query ID',
    'accountManager.flexTokenHint': 'IBKR Portal → Reports → Flex Queries → Token',
    'accountManager.queryIdHint': 'Found in your Flex Query configuration',
    'accountManager.save': 'Save',
    'accountManager.test': 'Test',
    'accountManager.syncNow': 'Sync Now',
    'accountManager.close': 'Close',
    'accountManager.credentialsConfigured': 'Credentials configured',
    'accountManager.noCredentials': 'No credentials — click to set up',
    'accountManager.hideCredentials': 'Hide credentials',
    'accountManager.editCredentials': 'Edit credentials',
    'accountManager.renameAccount': 'Rename account',
    'accountManager.deleteAccount': 'Delete account',
    'accountManager.select': 'Select',
    'accountManager.active': 'Active',
    'accountManager.newAccount': 'New Account',
    'accountManager.accountName': 'Account Name *',
    'accountManager.flexTokenOptional': 'Flex Token (optional — can add later)',
    'accountManager.queryIdOptional': 'Query ID (optional — can add later)',
    'accountManager.flexTokenPlaceholder': 'Enter IBKR Flex Token',
    'accountManager.tokenPlaceholder': 'Enter your Flex Token',
    'accountManager.tokenSavedPlaceholder': '•••••••• (leave empty to keep current)',
    'accountManager.queryIdPlaceholder': 'Enter Flex Query ID',
    'accountManager.queryIdSavedPlaceholder': '(leave empty to keep current)',
    'accountManager.createAccount': 'Create Account',
    'accountManager.creating': 'Creating...',
    'accountManager.addAccount': 'Add account',
    'accountManager.switchTitle': 'Switch account?',
    'accountManager.switchDescription': 'All displayed data will reload from "{name}". Your board notes are preserved.',
    'accountManager.switchConfirm': 'Switch',
    'accountManager.deleteTitle': 'Delete "{name}"?',
    'accountManager.deleteDescription': 'This will permanently delete this account and all its trades, NAV history, and board items. Your board notes are preserved. This cannot be undone.',
    'accountManager.deleteConfirm': 'Delete Account',
    'accountManager.syncCompleted': 'Sync completed successfully.',
    'accountManager.syncFailed': 'Sync failed. Check credentials.',
    'accountManager.testFailed': 'Connection test failed.',
    'accountManager.namePlaceholder': 'e.g. Paper Trading, Live Account...',

    // Connection Status
    'connection.lost': 'Connection lost. Retrying...',
    'connection.reconnected': 'Reconnected',
    'error.ibkrDisconnected': 'Interactive Brokers Platform Required',
    'error.ibkrDisconnectedDescription': 'To ensure this section functions correctly, please verify that Interactive Brokers (TWS or Gateway) is running with the API properly configured.',
    'error.technicalDetails': 'Technical Details',
    'error.downloadConnector': 'Download / Update Connector',
    'error.safariNotSupported': 'Safari is not supported',
    'error.safariNotSupportedDescription': 'The TWS integration cannot run in Safari due to a browser security restriction. Please open this app in Chrome, Firefox, or Edge to connect your Interactive Brokers account.',

    // Equity Curve
    'equityCurve.title': 'Equity Curve',
    'equityCurve.noData': 'No account data available',
    'equityCurve.syncHint': 'Click "Sync IBKR" to import data',
    'equityCurve.perspective.month': 'Month',
    'equityCurve.perspective.days': 'Days',
    'equityCurve.perspective.thisWeek': 'This Week',
    'equityCurve.perspective.months': 'Months',
    'equityCurve.perspective.years': 'Years',
    'equityCurve.start': 'Start',
    'equityCurve.current': 'Current:',
    'equityCurve.periodChange': 'Period Change:',
    'equityCurve.tooltip.balance': 'Balance:',
    'equityCurve.tooltip.change': 'Change:',

    // Heatmap Calendar
    'heatmap.title': 'Trading Activity',
    'heatmap.syncButton': 'Sync IBKR Data',
    'heatmap.syncing': 'Syncing...',
    'heatmap.lastSync': 'Last sync:',
    'heatmap.profit': 'Profit',
    'heatmap.loss': 'Loss',
    'heatmap.noTrades': 'No trades',
    'heatmap.weekOf': 'Week of',
    'heatmap.trades': 'trades',
    'heatmap.trade': 'trade',
    'heatmap.moreTrades': '+{n} more trades',
    'heatmap.showLess': 'Show less',
    'heatmap.days.mon': 'Mon',
    'heatmap.days.tue': 'Tue',
    'heatmap.days.wed': 'Wed',
    'heatmap.days.thu': 'Thu',
    'heatmap.days.fri': 'Fri',
    'heatmap.days.sat': 'Sat',
    'heatmap.days.sun': 'Sun',
    'heatmap.perspective.days': 'Days',
    'heatmap.perspective.weeks': 'Weeks',
    'heatmap.perspective.months': 'Months',
    'heatmap.perspective.years': 'Years',

    // Strategy Stats
    'strategyStats.title': 'Performance Analysis',
    'strategyStats.filter.lastYear': 'Last Year',
    'strategyStats.allTime': 'All Time',
    'strategyStats.previousYear': 'Previous Year',
    'strategyStats.thisWeek': 'This Week',
    'strategyStats.currentMonth': 'Current Month',
    'strategyStats.breakdown': 'Strategy Breakdown',
    'strategyStats.noData': 'No strategy data available',
    'strategyStats.callStrategies': 'CALL Strategies',
    'strategyStats.putStrategies': 'PUT Strategies',
    'strategyStats.errorAnalysis': 'Error Analysis',
    'strategyStats.noErrors': '🎉 No errors recorded! Great discipline.',
    'strategyStats.mostFrequent': 'Most Frequent',
    'strategyStats.leastFrequent': 'Least Frequent',
    'strategyStats.ofErrors': '% of errors',
    'strategyStats.avg': 'Avg',
    'strategyStats.total': 'Total',
    'strategyStats.totalPnl': 'Total P&L',
    'strategyStats.tradesLabel': 'Trades',

    // Onboarding
    'onboarding.skip': 'Skip setup',
    'onboarding.welcome.title': 'Welcome to Trading Journal Pro',
    'onboarding.welcome.subtitle': 'Track, analyze, and improve your trading performance',
    'onboarding.welcome.feature1.title': 'Performance Analytics',
    'onboarding.welcome.feature1.desc': 'Detailed metrics, equity curves, and P&L heatmaps for every trade.',
    'onboarding.welcome.feature2.title': 'Portfolio Board',
    'onboarding.welcome.feature2.desc': 'Visual Kanban-style boards to organize and track your positions.',
    'onboarding.welcome.feature3.title': 'Strike Calculator',
    'onboarding.welcome.feature3.desc': 'Real-time options strike calculation with implied volatility.',
    'onboarding.welcome.feature4.title': 'IBKR Integration',
    'onboarding.welcome.feature4.desc': 'Automatic sync with Interactive Brokers via FlexQuery reports.',
    'onboarding.welcome.getStarted': 'Get Started',
    'onboarding.credentials.title': 'Connect Your IBKR Account',
    'onboarding.credentials.subtitle': 'Enter your FlexQuery credentials to auto-import trades',
    'onboarding.credentials.saved': 'Credentials Saved',
    'onboarding.credentials.save': 'Save Credentials',
    'onboarding.credentials.error': 'Failed to save credentials. Please try again.',
    'onboarding.credentials.securityNote': 'Your credentials are stored locally and encrypted. They are never sent to any external server.',
    'onboarding.credentials.placeholder.token': 'Enter your Flex Token',
    'onboarding.credentials.placeholder.queryId': 'Enter your Query ID',
    'onboarding.sync.title': 'Sync Your Trades',
    'onboarding.sync.subtitle': 'Import your trade history from Interactive Brokers',
    'onboarding.sync.description': 'Click the button below to import your trades. This may take a moment.',
    'onboarding.sync.button': 'Sync Now',
    'onboarding.sync.syncing': 'Syncing trades...',
    'onboarding.sync.syncingSubtitle': 'Fetching data from IBKR FlexQuery',
    'onboarding.sync.complete': 'Sync Complete!',
    'onboarding.sync.failed': 'Sync Failed',
    'onboarding.sync.retry': 'Retry',
    'onboarding.finish.withSync': 'Go to Dashboard',
    'onboarding.finish.withoutSync': 'Finish Setup',

    // App-level
    'app.errorBoundary.title': 'Something went wrong',
    'app.errorBoundary.reload': 'Reload App',
    'app.views.tradeHistory': 'Trade History',
    'app.views.strategyPerformance': 'Strategy Performance',
    'app.views.settings': 'Settings',
    'app.views.settingsDescription': 'Configure IBKR integration, account preferences, and appearance',
    'app.views.strikeCalculator': 'Strike Calculator',
    'app.toast.syncComplete': 'Sync Complete',
    'app.toast.syncFailed': 'Sync Failed',
    'app.toast.setupRequired': 'Setup Required',
    'app.toast.setupMessage': 'Please configure IBKR credentials in Settings',
    'app.toast.syncError': 'Sync Error',

    // Month names (long)
    'months.0': 'January',
    'months.1': 'February',
    'months.2': 'March',
    'months.3': 'April',
    'months.4': 'May',
    'months.5': 'June',
    'months.6': 'July',
    'months.7': 'August',
    'months.8': 'September',
    'months.9': 'October',
    'months.10': 'November',
    'months.11': 'December',
    // Month names (short)
    'months.short.0': 'Jan',
    'months.short.1': 'Feb',
    'months.short.2': 'Mar',
    'months.short.3': 'Apr',
    'months.short.4': 'May',
    'months.short.5': 'Jun',
    'months.short.6': 'Jul',
    'months.short.7': 'Aug',
    'months.short.8': 'Sep',
    'months.short.9': 'Oct',
    'months.short.10': 'Nov',
    'months.short.11': 'Dec',
  },

  es: {
    // Common
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',
    'common.close': 'Cerrar',
    'common.confirm': 'Confirmar',
    'common.ok': 'Aceptar',
    'common.test': 'Probar',
    'common.retry': 'Reintentar',
    'common.back': 'Atrás',
    'common.next': 'Siguiente',
    'common.creating': 'Creando...',
    'common.saving': 'Guardando...',

    // Sidebar
    'sidebar.appTitle': 'Diario de Trading',
    'sidebar.appSubtitle': 'Edición Pro',
    'sidebar.nav.dashboard': 'Panel Principal',
    'sidebar.nav.portfolio': 'Portafolio',
    'sidebar.nav.portfolioBoards': 'Tableros de Portafolio',
    'sidebar.nav.trades': 'Operaciones',
    'sidebar.nav.performanceAnalysis': 'Análisis de Rendimiento',
    'sidebar.nav.strikeCalculator': 'Calculadora de Strike',
    'sidebar.nav.settings': 'Configuración',
    'sidebar.switchAccount': 'Cambiar Cuenta',
    'sidebar.collapse': 'Colapsar',
    'sidebar.lastSync': 'Últ. sincron.:',
    'sidebar.timeAgo.justNow': 'justo ahora',
    'sidebar.timeAgo.minutesAgo': 'hace {n}m',
    'sidebar.timeAgo.hoursAgo': 'hace {n}h',
    'sidebar.timeAgo.daysAgo': 'hace {n}d',

    // Dashboard
    'dashboard.title': 'Panel Principal',
    'dashboard.accountBalance': 'Balance de Cuenta',
    'dashboard.monthlyPnl': 'P&G de {month} {year}',
    'dashboard.detailedStatistics': 'Estadísticas Detalladas',
    'dashboard.filter.allTime': 'Todo el Tiempo',
    'dashboard.filter.ytd': 'Año Actual',
    'dashboard.filter.thisWeek': 'Esta Semana',
    'dashboard.filter.month': 'Mes',
    'dashboard.filter.thisQuarter': 'Este Trimestre',

    // KPI titles
    'kpi.winRate': 'Tasa de Éxito',
    'kpi.winningTrades': 'Operac. Ganadoras',
    'kpi.losingTrades': 'Operac. Perdedoras',
    'kpi.profitFactor': 'Factor de Beneficio',
    'kpi.averageWin': 'Ganancia Promedio',
    'kpi.averageLoss': 'Pérdida Promedio',
    'kpi.commissions': 'Comisiones',
    'kpi.totalTrades': 'Total Operaciones',

    // Trade History
    'trades.title': 'Historial de Operaciones',
    'trades.searchPlaceholder': 'Buscar operaciones...',
    'trades.col.date': 'Fecha',
    'trades.col.time': 'Hora',
    'trades.col.ticker': 'Símbolo',
    'trades.col.type': 'Tipo',
    'trades.col.qty': 'Cant.',
    'trades.col.price': 'Precio',
    'trades.col.strategy': 'Estrategia',
    'trades.col.netPnl': 'P&G Neto',
    'trades.col.commissions': 'Comisiones',
    'trades.col.errorTag': 'Etiqueta de Error',
    'trades.noStrategy': '-- Sin Estrategia --',
    'trades.selectStrategy': '-- Seleccionar --',
    'trades.otherStrategy': 'Otra Estrategia',
    'trades.pagination.showing': 'Mostrando {from} a {to} de {total} operaciones',
    'trades.pagination.page': 'Página {page} de {total}',
    'trades.barEdgeAlert.title': 'Entrada en Borde de Vela',
    'trades.barEdgeAlert.description': 'Esta operación fue ingresada durante los últimos 5 minutos de una vela de 30 minutos (minutos :25–:29 o :55–:59). Las entradas cerca de los bordes de vela pueden indicar decisiones apresuradas.',
    'trades.buyIndicator': 'Compra',
    'trades.strategyGroup.call': '📈 Estrategias CALL',
    'trades.strategyGroup.put': '📉 Estrategias PUT',
    'trades.strategyGroup.other': '⚡ Otras',

    // Psychology Tags
    'psychTag.none': 'Sin Error',
    'psychTag.fomo': 'FOMO',
    'psychTag.revenge_trading': 'Trading por Venganza',
    'psychTag.premature_exit': 'Salida Prematura',
    'psychTag.rule_violation': 'Violación de Regla',

    // Settings
    'settings.title': 'Configuración',
    'settings.heading': 'Configuración',
    'settings.description': 'Configura la integración con IBKR, preferencias de cuenta y apariencia',
    'settings.section.accounts': 'Cuentas',
    'settings.section.appearance': 'Apariencia',
    'settings.section.ibkr': 'API TWS de IBKR',
    'settings.section.portfolio': 'División de Portafolio',
    'settings.section.language': 'Idioma',
    'settings.section.general': 'General',
    'settings.theme.preference': 'Preferencia de Tema',
    'settings.theme.light': 'Claro',
    'settings.theme.dark': 'Oscuro',
    'settings.socketPort': 'Puerto Socket',
    'settings.socketPortDescription': 'Requerido para Portafolio, Tableros de Portafolio (tiempo real) y Calculadora de Strike.',
    'settings.stocks': 'Acciones',
    'settings.options': 'Opciones',
    'settings.saveButton': 'Guardar Configuración',
    'settings.language.title': 'Idioma de la Aplicación',
    'settings.language.english': 'English',
    'settings.language.spanish': 'Español',
    'settings.resetOnboarding.title': 'Tour de Bienvenida',
    'settings.resetOnboarding.description': 'Mostrar de nuevo el mensaje de bienvenida y la guía de configuración inicial.',
    'settings.resetOnboarding.button': 'Reiniciar Tour',

    // Account Manager
    'accountManager.credentialsSaved': 'Las credenciales están guardadas. Ingresa nuevos valores para actualizarlas.',
    'accountManager.credentialsEmpty': 'Ingresa tus credenciales de IBKR Flex para habilitar la sincronización.',
    'accountManager.flexToken': 'Token Flex',
    'accountManager.queryId': 'ID de Consulta',
    'accountManager.flexTokenHint': 'Portal IBKR → Reportes → Consultas Flex → Token',
    'accountManager.queryIdHint': 'Encontrado en tu configuración de Consulta Flex',
    'accountManager.save': 'Guardar',
    'accountManager.test': 'Probar',
    'accountManager.syncNow': 'Sincronizar Ahora',
    'accountManager.close': 'Cerrar',
    'accountManager.credentialsConfigured': 'Credenciales configuradas',
    'accountManager.noCredentials': 'Sin credenciales — haz clic para configurar',
    'accountManager.hideCredentials': 'Ocultar credenciales',
    'accountManager.editCredentials': 'Editar credenciales',
    'accountManager.renameAccount': 'Renombrar cuenta',
    'accountManager.deleteAccount': 'Eliminar cuenta',
    'accountManager.select': 'Seleccionar',
    'accountManager.active': 'Activa',
    'accountManager.newAccount': 'Nueva Cuenta',
    'accountManager.accountName': 'Nombre de Cuenta *',
    'accountManager.flexTokenOptional': 'Token Flex (opcional — se puede agregar después)',
    'accountManager.queryIdOptional': 'ID de Consulta (opcional — se puede agregar después)',
    'accountManager.flexTokenPlaceholder': 'Ingresa el Token Flex de IBKR',
    'accountManager.tokenPlaceholder': 'Ingresa tu Token Flex',
    'accountManager.tokenSavedPlaceholder': '•••••••• (dejar vacío para mantener el actual)',
    'accountManager.queryIdPlaceholder': 'Ingresa el ID de Consulta Flex',
    'accountManager.queryIdSavedPlaceholder': '(dejar vacío para mantener el actual)',
    'accountManager.createAccount': 'Crear Cuenta',
    'accountManager.creating': 'Creando...',
    'accountManager.addAccount': 'Agregar cuenta',
    'accountManager.switchTitle': '¿Cambiar cuenta?',
    'accountManager.switchDescription': 'Todos los datos mostrados se recargarán desde "{name}". Tus notas de tablero se conservan.',
    'accountManager.switchConfirm': 'Cambiar',
    'accountManager.deleteTitle': '¿Eliminar "{name}"?',
    'accountManager.deleteDescription': 'Esto eliminará permanentemente esta cuenta y todas sus operaciones, historial NAV y elementos del tablero. Tus notas de tablero se conservan. Esta acción no se puede deshacer.',
    'accountManager.deleteConfirm': 'Eliminar Cuenta',
    'accountManager.syncCompleted': 'Sincronización completada con éxito.',
    'accountManager.syncFailed': 'Sincronización fallida. Verifica las credenciales.',
    'accountManager.testFailed': 'Prueba de conexión fallida.',
    'accountManager.namePlaceholder': 'ej. Paper Trading, Cuenta Real...',

    // Connection Status
    'connection.lost': 'Conexión perdida. Reintentando...',
    'connection.reconnected': 'Reconectado',
    'error.ibkrDisconnected': 'Plataforma Interactive Brokers Requerida',
    'error.ibkrDisconnectedDescription': 'Para el correcto funcionamiento de esta sección, asegúrese de que la plataforma Interactive Brokers (TWS o Gateway) esté en ejecución y con la API configurada correctamente.',
    'error.technicalDetails': 'Detalles Técnicos',
    'error.downloadConnector': 'Descargar / Actualizar Connector',
    'error.safariNotSupported': 'Safari no es compatible',
    'error.safariNotSupportedDescription': 'La integración con TWS no puede ejecutarse en Safari debido a una restricción de seguridad del navegador. Abre esta aplicación en Chrome, Firefox o Edge para conectar tu cuenta de Interactive Brokers.',

    // Equity Curve
    'equityCurve.title': 'Curva de Equity',
    'equityCurve.noData': 'No hay datos de cuenta disponibles',
    'equityCurve.syncHint': 'Haz clic en "Sincronizar IBKR" para importar datos',
    'equityCurve.perspective.month': 'Mes',
    'equityCurve.perspective.days': 'Días',
    'equityCurve.perspective.thisWeek': 'Esta Semana',
    'equityCurve.perspective.months': 'Meses',
    'equityCurve.perspective.years': 'Años',
    'equityCurve.start': 'Inicio',
    'equityCurve.current': 'Actual:',
    'equityCurve.periodChange': 'Cambio del Período:',
    'equityCurve.tooltip.balance': 'Balance:',
    'equityCurve.tooltip.change': 'Cambio:',

    // Heatmap Calendar
    'heatmap.title': 'Actividad de Trading',
    'heatmap.syncButton': 'Sincronizar Datos IBKR',
    'heatmap.syncing': 'Sincronizando...',
    'heatmap.lastSync': 'Últ. sincron.:',
    'heatmap.profit': 'Ganancia',
    'heatmap.loss': 'Pérdida',
    'heatmap.noTrades': 'Sin operaciones',
    'heatmap.weekOf': 'Semana del',
    'heatmap.trades': 'operaciones',
    'heatmap.trade': 'operación',
    'heatmap.moreTrades': '+{n} más operaciones',
    'heatmap.showLess': 'Ver menos',
    'heatmap.days.mon': 'Lun',
    'heatmap.days.tue': 'Mar',
    'heatmap.days.wed': 'Mié',
    'heatmap.days.thu': 'Jue',
    'heatmap.days.fri': 'Vie',
    'heatmap.days.sat': 'Sáb',
    'heatmap.days.sun': 'Dom',
    'heatmap.perspective.days': 'Días',
    'heatmap.perspective.weeks': 'Semanas',
    'heatmap.perspective.months': 'Meses',
    'heatmap.perspective.years': 'Años',

    // Strategy Stats
    'strategyStats.title': 'Análisis de Rendimiento',
    'strategyStats.filter.lastYear': 'Año Anterior',
    'strategyStats.allTime': 'Todo el Tiempo',
    'strategyStats.previousYear': 'Año Anterior',
    'strategyStats.thisWeek': 'Esta Semana',
    'strategyStats.currentMonth': 'Mes Actual',
    'strategyStats.breakdown': 'Desglose de Estrategias',
    'strategyStats.noData': 'No hay datos de estrategia disponibles',
    'strategyStats.callStrategies': 'Estrategias CALL',
    'strategyStats.putStrategies': 'Estrategias PUT',
    'strategyStats.errorAnalysis': 'Análisis de Errores',
    'strategyStats.noErrors': '🎉 ¡Sin errores registrados! Gran disciplina.',
    'strategyStats.mostFrequent': 'Más Frecuente',
    'strategyStats.leastFrequent': 'Menos Frecuente',
    'strategyStats.ofErrors': '% de errores',
    'strategyStats.avg': 'Prom.',
    'strategyStats.total': 'Total',
    'strategyStats.totalPnl': 'P&G Total',
    'strategyStats.tradesLabel': 'Operaciones',

    // Onboarding
    'onboarding.skip': 'Omitir configuración',
    'onboarding.welcome.title': 'Bienvenido a Trading Journal Pro',
    'onboarding.welcome.subtitle': 'Rastrea, analiza y mejora tu rendimiento de trading',
    'onboarding.welcome.feature1.title': 'Análisis de Rendimiento',
    'onboarding.welcome.feature1.desc': 'Métricas detalladas, curvas de equity y mapas de calor de P&G para cada operación.',
    'onboarding.welcome.feature2.title': 'Tablero de Portafolio',
    'onboarding.welcome.feature2.desc': 'Tableros estilo Kanban visuales para organizar y seguir tus posiciones.',
    'onboarding.welcome.feature3.title': 'Calculadora de Strike',
    'onboarding.welcome.feature3.desc': 'Cálculo de strike de opciones en tiempo real con volatilidad implícita.',
    'onboarding.welcome.feature4.title': 'Integración IBKR',
    'onboarding.welcome.feature4.desc': 'Sincronización automática con Interactive Brokers mediante reportes FlexQuery.',
    'onboarding.welcome.getStarted': 'Comenzar',
    'onboarding.credentials.title': 'Conecta tu Cuenta IBKR',
    'onboarding.credentials.subtitle': 'Ingresa tus credenciales de FlexQuery para importar operaciones automáticamente',
    'onboarding.credentials.saved': 'Credenciales Guardadas',
    'onboarding.credentials.save': 'Guardar Credenciales',
    'onboarding.credentials.error': 'Error al guardar credenciales. Por favor intenta de nuevo.',
    'onboarding.credentials.securityNote': 'Tus credenciales se almacenan localmente y están cifradas. Nunca se envían a ningún servidor externo.',
    'onboarding.credentials.placeholder.token': 'Ingresa tu Token Flex',
    'onboarding.credentials.placeholder.queryId': 'Ingresa tu ID de Consulta',
    'onboarding.sync.title': 'Sincroniza tus Operaciones',
    'onboarding.sync.subtitle': 'Importa tu historial de operaciones desde Interactive Brokers',
    'onboarding.sync.description': 'Haz clic en el botón de abajo para importar tus operaciones. Esto puede tomar un momento.',
    'onboarding.sync.button': 'Sincronizar Ahora',
    'onboarding.sync.syncing': 'Sincronizando operaciones...',
    'onboarding.sync.syncingSubtitle': 'Obteniendo datos de IBKR FlexQuery',
    'onboarding.sync.complete': '¡Sincronización Completa!',
    'onboarding.sync.failed': 'Sincronización Fallida',
    'onboarding.sync.retry': 'Reintentar',
    'onboarding.finish.withSync': 'Ir al Panel',
    'onboarding.finish.withoutSync': 'Finalizar Configuración',

    // App-level
    'app.errorBoundary.title': 'Algo salió mal',
    'app.errorBoundary.reload': 'Recargar Aplicación',
    'app.views.tradeHistory': 'Historial de Operaciones',
    'app.views.strategyPerformance': 'Rendimiento de Estrategias',
    'app.views.settings': 'Configuración',
    'app.views.settingsDescription': 'Configura la integración con IBKR, preferencias de cuenta y apariencia',
    'app.views.strikeCalculator': 'Calculadora de Strike',
    'app.toast.syncComplete': 'Sincronización Completa',
    'app.toast.syncFailed': 'Sincronización Fallida',
    'app.toast.setupRequired': 'Configuración Requerida',
    'app.toast.setupMessage': 'Por favor configura las credenciales de IBKR en Configuración',
    'app.toast.syncError': 'Error de Sincronización',

    // Month names (long)
    'months.0': 'Enero',
    'months.1': 'Febrero',
    'months.2': 'Marzo',
    'months.3': 'Abril',
    'months.4': 'Mayo',
    'months.5': 'Junio',
    'months.6': 'Julio',
    'months.7': 'Agosto',
    'months.8': 'Septiembre',
    'months.9': 'Octubre',
    'months.10': 'Noviembre',
    'months.11': 'Diciembre',
    // Month names (short)
    'months.short.0': 'Ene',
    'months.short.1': 'Feb',
    'months.short.2': 'Mar',
    'months.short.3': 'Abr',
    'months.short.4': 'May',
    'months.short.5': 'Jun',
    'months.short.6': 'Jul',
    'months.short.7': 'Ago',
    'months.short.8': 'Sep',
    'months.short.9': 'Oct',
    'months.short.10': 'Nov',
    'months.short.11': 'Dic',
  },
};

// ─── Context ───────────────────────────────────────────────────────────────────

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('tj_lang');
    return (stored === 'en' || stored === 'es') ? stored : 'en';
  });

  const setLang = useCallback((newLang: Lang) => {
    localStorage.setItem('tj_lang', newLang);
    setLangState(newLang);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const dict = translations[lang];
      let text = dict[key] ?? translations['en'][key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v));
        });
      }
      return text;
    },
    [lang]
  );

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useTranslation() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useTranslation must be used within LanguageProvider');
  return ctx;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Returns an array of 12 full month names for the active language. */
export function useMonthNames(): string[] {
  const { t } = useTranslation();
  return Array.from({ length: 12 }, (_, i) => t(`months.${i}`));
}

/** Returns an array of 12 short month names (Jan/Ene …) for the active language. */
export function useShortMonthNames(): string[] {
  const { t } = useTranslation();
  return Array.from({ length: 12 }, (_, i) => t(`months.short.${i}`));
}

(() => {
  const message = 'An error has occured, please check report.txt for more details';
  const pendingKey = 'library-catalog-report-pending';
  const nativeFetch = window.fetch.bind(window);
  let promptOpen = false;
  let promptedThisPage = false;

  function setPending() {
    try {
      localStorage.setItem(pendingKey, 'true');
    } catch (error) {
      console.error('Unable to save the report recovery state:', error);
    }
  }

  function clearPending() {
    try {
      localStorage.removeItem(pendingKey);
    } catch (error) {
      console.error('Unable to clear the report recovery state:', error);
    }
  }

  async function openReport() {
    const reportWindow = window.open('about:blank', '_blank');
    if (!reportWindow) {
      window.location.assign('/api/report.txt');
      return;
    }

    try {
      const response = await nativeFetch('/api/report.txt');
      if (!response.ok || !response.headers.get('content-type')?.includes('text/plain')) {
        throw new Error('The report is not available yet');
      }
      const report = await response.blob();
      reportWindow.location.href = URL.createObjectURL(report);
      clearPending();
    } catch (error) {
      reportWindow.close();
      setPending();
      console.error('Unable to open report.txt:', error);
    }
  }

  function promptForReport(details) {
    setPending();
    if (promptOpen || promptedThisPage) return;
    promptOpen = true;
    promptedThisPage = true;

    const reportRequest = details
      ? nativeFetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      }).catch((error) => {
        console.error('Unable to send error details to the server:', error);
      })
      : Promise.resolve();

    reportRequest.finally(() => {
      promptOpen = false;
      if (window.confirm(message)) openReport();
    });
  }

  window.fetch = async (...args) => {
    const requestUrl = args[0] instanceof Request ? args[0].url : String(args[0]);
    const isReportRequest = requestUrl.includes('/api/report.txt');
    const isErrorRequest = requestUrl.includes('/api/errors');
    try {
      const response = await nativeFetch(...args);
      if (response.status >= 500 && !isReportRequest && !isErrorRequest) {
        promptForReport({
          source: 'api',
          message: `API request failed with status ${response.status}`,
          url: requestUrl,
        });
      }
      return response;
    } catch (error) {
      if (!isReportRequest && !isErrorRequest) {
        promptForReport({
          source: 'network',
          message: error.message,
          stack: error.stack,
          url: requestUrl,
        });
      }
      throw error;
    }
  };

  window.addEventListener('error', (event) => {
    promptForReport({
      source: 'browser',
      message: event.message || 'An unexpected browser error occurred',
      stack: event.error?.stack,
      url: window.location.pathname,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    promptForReport({
      source: 'browser',
      message: error?.message || String(error || 'Unhandled promise rejection'),
      stack: error?.stack,
      url: window.location.pathname,
    });
  });

  try {
    if (localStorage.getItem(pendingKey) === 'true') {
      promptForReport({
        source: 'recovery',
        message: 'The application previously encountered an error',
        url: window.location.pathname,
      });
    }
  } catch (error) {
    console.error('Unable to check the report recovery state:', error);
  }
})();

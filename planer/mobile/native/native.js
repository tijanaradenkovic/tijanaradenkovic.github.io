(function () {
  'use strict';
  var cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform()) return;
  var files = cap.registerPlugin('PlannerFiles');
  var types = { json: 'application/json', ics: 'text/calendar', html: 'text/html', md: 'text/markdown', bib: 'text/plain', txt: 'text/plain' };
  window.PlannerNative = {
    saveFile: async function (name, text) {
      var result = await files.save({ name: name, text: text, mimeType: types[name.split('.').pop()] || 'text/plain' });
      return result.saved ? 'ok' : '';
    }
  };
}());

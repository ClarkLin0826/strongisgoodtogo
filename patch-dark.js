const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const classMap = {
  'bg-white': 'dark:bg-slate-800',
  'bg-slate-50': 'dark:bg-slate-900',
  'bg-slate-100': 'dark:bg-slate-800/50',
  'bg-slate-200': 'dark:bg-slate-700/50',
  'text-slate-800': 'dark:text-gray-100',
  'text-slate-700': 'dark:text-gray-200',
  'text-slate-600': 'dark:text-gray-300',
  'text-slate-500': 'dark:text-gray-400',
  'text-slate-400': 'dark:text-gray-500',
  'border-white': 'dark:border-slate-800',
  'border-slate-100': 'dark:border-slate-700',
  'border-slate-200': 'dark:border-slate-600',
  'border-slate-300': 'dark:border-slate-500'
};

html = html.replace(/class="([^"]+)"/g, (match, classAttr) => {
  let classes = classAttr.split(/\s+/).filter(Boolean);
  let newClasses = [];
  classes.forEach(c => {
    newClasses.push(c);
    if (classMap[c]) {
      newClasses.push(classMap[c]);
    }
  });
  return `class="${[...new Set(newClasses)].join(' ')}"`;
});

// Remove existing body background
html = html.replace('background-color: #f8fafc;', '@apply bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-gray-100;');

// Add Darkmode toggle to Tailwind Config & load barcode
const headAdditions = `
  <script>
    tailwind.config = {
      darkMode: 'class',
    }
  </script>
  <script src="https://unpkg.com/html5-qrcode"></script>
`;

html = html.replace('<script src="https://cdn.tailwindcss.com"></script>', headAdditions + '\n  <script src="https://cdn.tailwindcss.com"></script>');

// Add toggle button in Header
const headerToggle = `
      <div class="flex items-center gap-3">
        <button id="theme-toggle" class="p-2 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-500 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition">
          <svg id="theme-toggle-dark-icon" class="w-5 h-5 hidden" fill="currentColor" viewBox="0 0 20 20">
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
          </svg>
          <svg id="theme-toggle-light-icon" class="w-5 h-5 hidden" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"></path>
          </svg>
        </button>
        <button id="btn-logout" class="text-sm font-medium text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-100 hidden">登出</button>
      </div>`;

html = html.replace('<button id="btn-logout" class="text-sm font-medium text-slate-500 hover:text-slate-800 hidden">登出</button>', headerToggle);

fs.writeFileSync('index.html', html);
console.log('done patched');

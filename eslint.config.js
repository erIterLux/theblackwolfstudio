import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const frontendFiles = ['src/**/*.{js,jsx}'];
const functionFiles = ['functions/**/*.js'];

export default [
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'functions/node_modules/**',
            'functions/lib/**',
            'functions/.firebase/**',
        ],
    },

    js.configs.recommended,

    {
        ...reactHooks.configs.flat.recommended,
        files: frontendFiles,
    },

    {
        ...reactRefresh.configs.vite,
        files: frontendFiles,
    },

    {
        files: frontendFiles,
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: globals.browser,
            parserOptions: {
                ecmaVersion: 'latest',
                ecmaFeatures: { jsx: true },
                sourceType: 'module',
            },
        },
        rules: {
            'no-unused-vars': [
                'error',
                {
                    varsIgnorePattern: '^[A-Z_]',
                    argsIgnorePattern: '^(Icon|_)',
                },
            ],
            'react-refresh/only-export-components': 'off',
        },
    },

    {
        files: functionFiles,
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: globals.node,
        },
        rules: {
            'no-unused-vars': [
                'error',
                {
                    varsIgnorePattern: '^[A-Z_]',
                    argsIgnorePattern: '^_',
                },
            ],
        },
    },

    {
        files: ['*.config.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: globals.node,
        },
    },
];
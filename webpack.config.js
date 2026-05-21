const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';

  return {
    entry: {
      'background/service-worker': './src/background/service-worker.ts',
      'ui/sidepanel/sidepanel': './src/ui/sidepanel/index.tsx',
      'ui/popup/popup': './src/ui/popup/index.tsx',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({ filename: '[name].css' }),
      new HtmlWebpackPlugin({
        template: './src/ui/sidepanel/index.html',
        filename: 'ui/sidepanel/index.html',
        chunks: ['ui/sidepanel/sidepanel'],
      }),
      new HtmlWebpackPlugin({
        template: './src/ui/popup/index.html',
        filename: 'ui/popup/index.html',
        chunks: ['ui/popup/popup'],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'manifest.json', to: 'manifest.json' },
          { from: 'assets', to: 'assets', noErrorOnMissing: true },
        ],
      }),
    ],
    devtool: isDev ? 'inline-source-map' : false,
    optimization: {
      // Service workers cannot use chunking — keep them as single files
      splitChunks: {
        chunks: (chunk) => chunk.name != null && !chunk.name.startsWith('background/'),
      },
    },
  };
};

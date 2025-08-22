import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, ResponsiveContainer } from 'recharts';
import { Upload, AlertTriangle, Clock, Eye, FileVideo, TrendingUp, Database } from 'lucide-react';

function App() {
  const [file, setFile] = useState(null);
  const [intervalSeconds, setIntervalSeconds] = useState(60);
  const [alertLimit, setAlertLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedView, setSelectedView] = useState('upload');

  const fetchHistory = async () => {
    try {
      const response = await fetch('http://localhost:5000/history');
      const data = await response.json();
      setHistory(data);
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) {
      alert('Please select a video file');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('video', file);
    formData.append('interval_seconds', intervalSeconds);
    formData.append('alert_limit', alertLimit);

    try {
      const response = await fetch('http://localhost:5000/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        setResults(data);
        setSelectedView('results');
        fetchHistory(); // Refresh history
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert(`Upload failed: ${error.message}`);
    }
    setLoading(false);
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const prepareChartData = () => {
    if (!results?.intervals) return [];
    
    return results.intervals.map((interval, index) => ({
      interval: index + 1,
      time: formatTime(interval.timestamp),
      count: interval.total_count,
      alert: interval.alert,
      timestamp: interval.timestamp
    }));
  };

  const getObjectTypeData = () => {
    if (!results?.intervals) return [];
    
    const objectTypes = {};
    results.intervals.forEach(interval => {
      Object.entries(interval.objects_detected || {}).forEach(([type, count]) => {
        if (!objectTypes[type]) {
          objectTypes[type] = { type, total: 0, intervals: 0 };
        }
        objectTypes[type].total += count;
        objectTypes[type].intervals += 1;
      });
    });
    
    return Object.values(objectTypes).map(obj => ({
      ...obj,
      average: (obj.total / obj.intervals).toFixed(2)
    }));
  };

  const AlertCard = ({ alert, index }) => (
    <div key={index} className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
      <div className="flex items-center">
        <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
        <div>
          <p className="text-red-800 font-medium">Alert at {formatTime(alert.timestamp)}</p>
          <p className="text-red-700 text-sm">{alert.message}</p>
        </div>
      </div>
    </div>
  );

  const IntervalCard = ({ interval, index }) => (
    <div key={index} className={`p-4 rounded-lg border ${interval.alert ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex justify-between items-start mb-3">
        <h4 className="font-medium text-gray-900">
          Interval {index + 1} ({formatTime(interval.timestamp)} - {formatTime(interval.timestamp + interval.duration)})
        </h4>
        {interval.alert && <AlertTriangle className="h-5 w-5 text-red-500" />}
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-sm text-gray-600">Total Objects</p>
          <p className="text-xl font-semibold">{interval.total_count}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Duration</p>
          <p className="text-xl font-semibold">{interval.duration}s</p>
        </div>
      </div>
      
      {Object.keys(interval.objects_detected || {}).length > 0 && (
        <div className="mb-3">
          <p className="text-sm text-gray-600 mb-1">Objects Detected:</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(interval.objects_detected).map(([type, count]) => (
              <span key={type} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                {type}: {count.toFixed(1)}
              </span>
            ))}
          </div>
        </div>
      )}
      
      {interval.ai_summary && (
        <div className="bg-white p-3 rounded border">
          <p className="text-sm text-gray-600 mb-1">AI Summary:</p>
          <p className="text-sm text-gray-800">{interval.ai_summary}</p>
        </div>
      )}
    </div>
  );

  const HistoryItem = ({ item }) => (
    <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-medium text-gray-900">{item.video_filename}</h4>
          <p className="text-sm text-gray-600">{new Date(item.analysis_date).toLocaleString()}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600">Duration: {Math.round(item.video_duration)}s</p>
          <p className="text-sm text-gray-600">Intervals: {item.total_intervals}</p>
          <p className="text-sm text-gray-600">Alerts: {item.alerts?.length || 0}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <FileVideo className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-xl font-semibold text-gray-900">Object Counter Pro</h1>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => setSelectedView('upload')}
                className={`px-4 py-2 rounded-md ${selectedView === 'upload' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <Upload className="h-4 w-4 inline mr-2" />
                Upload
              </button>
              <button
                onClick={() => setSelectedView('results')}
                className={`px-4 py-2 rounded-md ${selectedView === 'results' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-900'} ${!results ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!results}
              >
                <TrendingUp className="h-4 w-4 inline mr-2" />
                Results
              </button>
              <button
                onClick={() => setSelectedView('history')}
                className={`px-4 py-2 rounded-md ${selectedView === 'history' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <Database className="h-4 w-4 inline mr-2" />
                History
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Upload View */}
        {selectedView === 'upload' && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Upload Video for Analysis</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Video File
                </label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Clock className="h-4 w-4 inline mr-1" />
                    Time Interval (seconds)
                  </label>
                  <input
                    type="number"
                    value={intervalSeconds}
                    onChange={(e) => setIntervalSeconds(parseInt(e.target.value))}
                    min="10"
                    max="300"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">How often to analyze the video (10-300 seconds)</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <AlertTriangle className="h-4 w-4 inline mr-1" />
                    Alert Threshold
                  </label>
                  <input
                    type="number"
                    value={alertLimit}
                    onChange={(e) => setAlertLimit(parseInt(e.target.value))}
                    min="1"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Alert when object count exceeds this number</p>
                </div>
              </div>
              
              <button
                onClick={handleUpload}
                disabled={loading || !file}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Upload and Analyze'}
              </button>
            </div>
          </div>
        )}

        {/* Results View */}
        {selectedView === 'results' && results && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-lg shadow">
                <p className="text-sm text-gray-600">Total Duration</p>
                <p className="text-2xl font-semibold">{Math.round(results.video_duration)}s</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <p className="text-sm text-gray-600">Intervals</p>
                <p className="text-2xl font-semibold">{results.total_intervals}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <p className="text-sm text-gray-600">Alerts</p>
                <p className="text-2xl font-semibold text-red-600">{results.alerts?.length || 0}</p>
              </div>
              <div className="bg-white p-4 rounded-lg shadow">
                <p className="text-sm text-gray-600">Avg Objects/Interval</p>
                <p className="text-2xl font-semibold">
                  {(results.intervals.reduce((sum, interval) => sum + interval.total_count, 0) / results.intervals.length).toFixed(1)}
                </p>
              </div>
            </div>

            {/* Alerts */}
            {results.alerts && results.alerts.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  <AlertTriangle className="h-5 w-5 inline mr-2 text-red-500" />
                  Alerts ({results.alerts.length})
                </h3>
                <div className="space-y-3">
                  {results.alerts.map((alert, index) => (
                    <AlertCard key={index} alert={alert} index={index} />
                  ))}
                </div>
              </div>
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Timeline Chart */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Object Count Timeline</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={prepareChartData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="interval" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value, name) => [value, 'Object Count']}
                      labelFormatter={(label) => `Interval ${label}`}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="count" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={(props) => {
                        const { payload } = props;
                        return (
                          <circle
                            {...props}
                            fill={payload.alert ? "#ef4444" : "#3b82f6"}
                            r={payload.alert ? 6 : 4}
                          />
                        );
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Object Types Chart */}
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Object Types Distribution</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={getObjectTypeData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="total" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Interval Details */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Interval Analysis</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.intervals.map((interval, index) => (
                  <IntervalCard key={index} interval={interval} index={index} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* History View */}
        {selectedView === 'history' && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Analysis History</h2>
            {history.length > 0 ? (
              <div className="space-y-4">
                {history.map((item, index) => (
                  <HistoryItem key={index} item={item} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No analysis history found</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
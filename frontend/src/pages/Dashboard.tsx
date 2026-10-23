import { useCallback, useEffect, useState } from "react";

import type { FormEvent } from "react";

import { useWebSocket } from "../hooks/useWebSocket";

import {
    getProjects,
    createProject,
    getProjectAnalytics,
    getLatencyHistory,
    getProjectIncidents,
    getEndpointAnalytics,
    getRecentApiEvents,
} from "../services/projectService";

import type {
    Project,
    ProjectAnalytics,
    EndpointAnalytics,
    LatencyPoint,
    Incident,
    RecentApiEvent,
} from "../services/projectService";

import { getEndpoints } from "../services/endpointService";
import type { Endpoint } from "../services/endpointService";

import StatsCards from "../components/StatsCards";
import ProjectCard from "../components/ProjectCard";
import AnalyticsCards from "../components/AnalyticsCards";
import AnalyticsFilters from "../components/AnalyticsFilters";
import LatencyChart from "../components/LatencyChart";
import RecentEvents from "../components/RecentEvents";
import IncidentPanel from "../components/IncidentPanel";
import EndpointAnalyticsCard from "../components/EndpointAnalyticsCard";


function Dashboard() {

    const userName = localStorage.getItem("userName") || "User";

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("userName");
        localStorage.removeItem("userEmail");
        window.location.href = "/";
    };


    const {
        events,
        connected,
    } = useWebSocket();

    const [historicalEvents, setHistoricalEvents] =
        useState<RecentApiEvent[]>([]);


    /*
     * Analytics filters
     */
    const [minutes, setMinutes] =
        useState(60);

    const [filterEndpoint, setFilterEndpoint] =
        useState("");

    const [filterMethod, setFilterMethod] =
        useState("");

    const [filterStatus, setFilterStatus] =
        useState("");


    /*
     * Projects
     */
    const [projects, setProjects] =
        useState<Project[]>([]);

    const [projectEndpoints, setProjectEndpoints] =
        useState<
            Record<string, Endpoint[]>
        >({});

    const [projectAnalytics, setProjectAnalytics] =
        useState<
            Record<string, ProjectAnalytics>
        >({});

    const [endpointAnalytics, setEndpointAnalytics] =
        useState<
            Record<string, EndpointAnalytics[]>
        >({});

    const [latencyHistory, setLatencyHistory] =
        useState<
            Record<string, LatencyPoint[]>
        >({});


    /*
     * Incidents
     */
    const [activeIncidents, setActiveIncidents] =
        useState<
            Record<string, Incident[]>
        >({});

    const [resolvedIncidents, setResolvedIncidents] =
        useState<
            Record<string, Incident[]>
        >({});


    /*
     * Loading / error state
     */
    const [loadingProjects, setLoadingProjects] =
        useState(true);

    const [dashboardError, setDashboardError] =
        useState("");

    const [projectName, setProjectName] = useState("");
    const [projectDescription, setProjectDescription] = useState("");
    const [creatingProject, setCreatingProject] = useState(false);
    const [projectCreateError, setProjectCreateError] = useState("");
    const [projectCreateSuccess, setProjectCreateSuccess] = useState("");


    /*
     * Load project data
     */
    const loadProjectData = useCallback(async (showLoading = false) => {
        try {
            if (showLoading) {
                setLoadingProjects(true);
            }
            setDashboardError("");


            /*
             * Load projects
             */
            const data =
                await getProjects();

            setProjects(data);


            const endpointMap:
                Record<string, Endpoint[]> = {};

            const analyticsMap:
                Record<string, ProjectAnalytics> = {};

            const endpointAnalyticsMap:
                Record<
                    string,
                    EndpointAnalytics[]
                > = {};

            const latencyMap:
                Record<
                    string,
                    LatencyPoint[]
                > = {};

            const activeIncidentsMap:
                Record<
                    string,
                    Incident[]
                > = {};

            const resolvedIncidentsMap:
                Record<
                    string,
                    Incident[]
                > = {};


            /*
             * Build analytics filters
             */
            const analyticsFilters = {

                minutes,

                ...(filterEndpoint
                    ? {
                        endpoint:
                            filterEndpoint.trim(),
                    }
                    : {}),

                ...(filterMethod
                    ? {
                        method:
                            filterMethod,
                    }
                    : {}),

                ...(filterStatus
                    ? {
                        status:
                            filterStatus,
                    }
                    : {}),
            };


            /*
             * Load each project
             */
            for (const project of data) {

                /*
                 * Endpoints
                 */
                try {

                    const endpoints =
                        await getEndpoints(
                            project._id
                        );

                    endpointMap[
                        project._id
                    ] = endpoints;

                } catch (error) {

                    console.error(
                        "Failed to load endpoints:",
                        error
                    );

                    endpointMap[
                        project._id
                    ] = [];
                }


                /*
                 * Project analytics
                 */
                try {

                    const analytics =
                        await getProjectAnalytics(
                            project._id,
                            analyticsFilters
                        );

                    analyticsMap[
                        project._id
                    ] = analytics;

                } catch (error) {

                    console.error(
                        "Failed to load analytics:",
                        error
                    );

                    analyticsMap[
                        project._id
                    ] = {
                        totalRequests: 0,
                        successfulRequests: 0,
                        failedRequests: 0,
                        errorRate: 0,
                        averageLatency: 0,
                        maxLatency: 0,
                        p95Latency: 0,
                    };
                }


                /*
                 * Endpoint analytics
                 */
                try {

                    const analytics =
                        await getEndpointAnalytics(
                            project._id,
                            analyticsFilters
                        );

                    endpointAnalyticsMap[
                        project._id
                    ] = analytics;

                } catch (error) {

                    console.error(
                        "Failed to load endpoint analytics:",
                        error
                    );

                    endpointAnalyticsMap[
                        project._id
                    ] = [];
                }


                /*
                 * Latency history
                 */
                try {

                    const history =
                        await getLatencyHistory(
                            project._id,
                            analyticsFilters
                        );

                    latencyMap[
                        project._id
                    ] = history;

                } catch (error) {

                    console.error(
                        "Failed to load latency history:",
                        error
                    );

                    latencyMap[
                        project._id
                    ] = [];
                }


                /*
                 * Project-specific incidents
                 */
                try {

                    const incidents =
                        await getProjectIncidents(
                            project._id
                        );

                    activeIncidentsMap[
                        project._id
                    ] = incidents.active;

                    resolvedIncidentsMap[
                        project._id
                    ] = incidents.resolved;

                } catch (error) {

                    console.error(
                        "Failed to load incidents:",
                        error
                    );

                    activeIncidentsMap[
                        project._id
                    ] = [];

                    resolvedIncidentsMap[
                        project._id
                    ] = [];
                }

                /*
                 * Persisted recent API events
                 */
                try {
                    const recentEvents = await getRecentApiEvents(
                        project._id
                    );

                    setHistoricalEvents((previousEvents) => [
                        ...previousEvents.filter(
                            (event) => event.projectId !== project._id
                        ),
                        ...recentEvents,
                    ]);
                } catch (error) {
                    console.error(
                        "Failed to load recent API events:",
                        error
                    );
                }
            }


            /*
             * Update state
             */
            setProjectEndpoints(
                endpointMap
            );

            setProjectAnalytics(
                analyticsMap
            );

            setEndpointAnalytics(
                endpointAnalyticsMap
            );

            setLatencyHistory(
                latencyMap
            );

            setActiveIncidents(
                activeIncidentsMap
            );

            setResolvedIncidents(
                resolvedIncidentsMap
            );

        } catch (error) {

            console.error(
                "Failed to load dashboard:",
                error
            );

            setDashboardError(
                "Unable to load dashboard data. Please check that the PulseForge backend is running."
            );

        } finally {
            if (showLoading) {
                setLoadingProjects(false);
            }
        }
    }, [
        minutes,
        filterEndpoint,
        filterMethod,
        filterStatus,
    ]);


    const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const name = projectName.trim();
        const description = projectDescription.trim();

        setProjectCreateError("");
        setProjectCreateSuccess("");

        if (!name) {
            setProjectCreateError("Project name is required.");
            return;
        }

        if (name.length > 100) {
            setProjectCreateError("Project name cannot exceed 100 characters.");
            return;
        }

        if (description.length > 500) {
            setProjectCreateError("Description cannot exceed 500 characters.");
            return;
        }

        try {
            setCreatingProject(true);
            await createProject(name, description);
            setProjectName("");
            setProjectDescription("");
            setProjectCreateSuccess("Project created successfully.");
            await loadProjectData();
        } catch (error) {
            console.error("Failed to create project:", error);
            setProjectCreateError(
                "Unable to create project. Please check your connection and try again."
            );
        } finally {
            setCreatingProject(false);
        }
    };


    /*
     * Load on startup
     * and when analytics filters change
     */
    useEffect(() => {
        const timer = setTimeout(() => {
            void loadProjectData(true);
        }, 0);

        return () => {
            clearTimeout(timer);
        };
    }, [loadProjectData]);


    /*
     * Refresh data after WebSocket events
     */
    useEffect(() => {
        if (events.length === 0) {
            return;
        }

        const latestEvent = events[0];

        if (
            latestEvent.type === "incident_created" ||
            latestEvent.type === "incident_resolved"
        ) {
            const timer = setTimeout(() => {
                void loadProjectData();
            }, 0);

            return () => {
                clearTimeout(timer);
            };
        }

        const timer = setTimeout(() => {
            void loadProjectData();
        }, 300);

        return () => {
            clearTimeout(timer);
        };
    }, [events, loadProjectData]);



    /*
     * Request Activity
     *
     * Merge live and historical events by the database request ID.
     * This avoids dropping separate requests that happen to have identical
     * endpoint, method, status, and latency values.
     */
    const apiEvents = events.filter(
        (event) =>
            event.type === "api_request" ||
            event.type === "chaos_event"
    );


    const liveRequestIds = new Set(
        apiEvents
            .map((event) => event.requestId)
            .filter((id): id is string => id !== undefined)
            .map(String)
    );


    const historicalOnlyEvents = historicalEvents.filter(
        (historical) => !liveRequestIds.has(String(historical.requestId))
    );

    const combinedApiEvents = [
        ...apiEvents,
        ...historicalOnlyEvents,
    ];

    const totalRequests = combinedApiEvents.length;

    const successfulRequests = combinedApiEvents.filter(
        (event) =>
            event.type === "api_request" &&
            event.success === true
    ).length;

    const errors = combinedApiEvents.filter(
        (event) =>
            (event.type === "api_request" &&
                event.success === false) ||
            event.type === "chaos_event"
    ).length;

    /*
     * Use the same merged API event list for the Recent API Events table.
     */
    const displayedEvents = combinedApiEvents;


    return (
        <div className="min-h-screen bg-slate-950 text-white p-8">

            <div className="max-w-7xl mx-auto">

                {/* Header */}

                <div className="mb-8">

                    <div className="flex items-center justify-between">

                        <div>

                            <h1 className="text-3xl font-bold">
                                PulseForge
                            </h1>

                            <p className="text-slate-400 mt-2">
                                Real-Time API Chaos & Observability Platform
                            </p>

                        </div>


                        <div className="flex flex-wrap items-center gap-4">

                            <div className="text-right">
                                <p className="text-sm text-slate-400">
                                    Signed in as
                                </p>

                                <p className="font-medium text-white">
                                    {userName}
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <div
                                    className={`w-3 h-3 rounded-full ${connected
                                        ? "bg-green-500"
                                        : "bg-red-500"
                                        }`}
                                />

                                <span className="text-sm">
                                    {connected ? "Connected" : "Disconnected"}
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={handleLogout}
                                className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 transition text-sm font-medium"
                            >
                                Logout
                            </button>

                        </div>

                    </div>

                </div>


                {/* Dashboard error */}

                {dashboardError && (

                    <div className="mb-8 bg-red-500/10 border border-red-500/30 rounded-xl p-5">

                        <div className="flex items-center justify-between gap-4">

                            <div>

                                <h2 className="font-semibold text-red-400">
                                    Dashboard unavailable
                                </h2>

                                <p className="text-sm text-slate-400 mt-1">
                                    {dashboardError}
                                </p>

                            </div>

                            <button
                                onClick={() => void loadProjectData(true)} className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition text-sm font-medium"
                            >
                                Retry
                            </button>

                        </div>

                    </div>

                )}


                {/* Live Statistics */}

                <StatsCards
                    totalRequests={
                        totalRequests
                    }

                    successfulRequests={
                        successfulRequests
                    }

                    errors={
                        errors
                    }
                />


                {/* Projects */}

                <div className="mt-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">

                    <div className="p-6 border-b border-slate-800">

                        <h2 className="text-xl font-semibold">
                            Projects
                        </h2>

                        <p className="text-sm text-slate-400 mt-1">
                            Your monitored API projects
                        </p>

                    </div>

                    {/* Create Project */}
                    <form
                        onSubmit={handleCreateProject}
                        className="p-6 border-b border-slate-800 space-y-4"
                    >
                        <h3 className="text-lg font-semibold">Create a project</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="project-name" className="block text-sm text-slate-300 mb-2">
                                    Project name <span className="text-red-400">*</span>
                                </label>
                                <input
                                    id="project-name"
                                    name="projectName"
                                    type="text"
                                    value={projectName}
                                    onChange={(event) => setProjectName(event.target.value)}
                                    maxLength={100}
                                    required
                                    placeholder="e.g. Payment API"
                                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label htmlFor="project-description" className="block text-sm text-slate-300 mb-2">
                                    Description <span className="text-slate-500">(optional)</span>
                                </label>
                                <input
                                    id="project-description"
                                    name="projectDescription"
                                    type="text"
                                    value={projectDescription}
                                    onChange={(event) => setProjectDescription(event.target.value)}
                                    maxLength={500}
                                    placeholder="What does this API do?"
                                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-4 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {projectCreateError && (
                            <p role="alert" className="text-sm text-red-400">
                                {projectCreateError}
                            </p>
                        )}
                        {projectCreateSuccess && (
                            <p role="status" className="text-sm text-green-400">
                                {projectCreateSuccess}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={creatingProject}
                            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                        >
                            {creatingProject ? "Creating project..." : "Create project"}
                        </button>
                    </form>


                    {/* Analytics Filters */}

                    <div className="p-6 border-b border-slate-800">

                        <AnalyticsFilters

                            minutes={
                                minutes
                            }

                            endpoint={
                                filterEndpoint
                            }

                            method={
                                filterMethod
                            }

                            status={
                                filterStatus
                            }

                            onMinutesChange={
                                setMinutes
                            }

                            onEndpointChange={
                                setFilterEndpoint
                            }

                            onMethodChange={
                                setFilterMethod
                            }

                            onStatusChange={
                                setFilterStatus
                            }

                        />

                    </div>


                    {/* Project data */}

                    {loadingProjects ? (

                        <div className="p-6">

                            <p className="text-slate-400">
                                Loading projects...
                            </p>

                        </div>

                    ) : projects.length === 0 ? (

                        <div className="p-6">

                            <p className="text-slate-400">
                                No projects found.
                            </p>

                            <p className="text-sm text-slate-500 mt-1">
                                Create a project to start monitoring an API.
                            </p>

                        </div>

                    ) : (

                        <div className="divide-y divide-slate-800">

                            {projects.map(
                                (project) => {

                                    const endpoints =
                                        projectEndpoints[
                                        project._id
                                        ] || [];


                                    const projectActiveIncidents =
                                        activeIncidents[
                                        project._id
                                        ] || [];


                                    const projectResolvedIncidents =
                                        resolvedIncidents[
                                        project._id
                                        ] || [];


                                    const analytics =
                                        projectAnalytics[
                                        project._id
                                        ];


                                    const endpointAnalyticsData =
                                        endpointAnalytics[
                                        project._id
                                        ] || [];


                                    const history =
                                        latencyHistory[
                                        project._id
                                        ] || [];


                                    return (

                                        <ProjectCard

                                            key={
                                                project._id
                                            }

                                            project={
                                                project
                                            }

                                            endpoints={
                                                endpoints
                                            }


                                            onEndpointCreated={loadProjectData}
                                        >

                                            {/* Project-specific Incidents */}

                                            <IncidentPanel

                                                activeIncidents={
                                                    projectActiveIncidents
                                                }

                                                resolvedIncidents={
                                                    projectResolvedIncidents
                                                }

                                            />


                                            {/* Historical Analytics */}

                                            <div className="mt-6">

                                                <h4 className="text-sm font-medium text-slate-300 mb-3">
                                                    Historical Analytics
                                                </h4>

                                                <AnalyticsCards

                                                    analytics={
                                                        analytics
                                                    }

                                                />

                                            </div>


                                            {/* Endpoint Analytics */}

                                            <div className="mt-6">

                                                <h4 className="text-sm font-medium text-slate-300 mb-3">
                                                    Endpoint Analytics
                                                </h4>

                                                <EndpointAnalyticsCard

                                                    analytics={
                                                        endpointAnalyticsData
                                                    }

                                                />

                                            </div>


                                            {/* Latency */}

                                            <div className="mt-6">

                                                <h4 className="text-sm font-medium text-slate-300 mb-3">
                                                    Latency Over Time
                                                </h4>

                                                <LatencyChart

                                                    history={
                                                        history
                                                    }

                                                />

                                            </div>

                                        </ProjectCard>
                                    );
                                }
                            )}

                        </div>
                    )}

                </div>


                {/* Recent Events */}

                <div className="mt-8">

                    <RecentEvents
                        events={displayedEvents}
                    />

                </div>

            </div>

        </div>
    );
}

export default Dashboard;
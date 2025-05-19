import React, {useCallback, useEffect, useMemo, useState, lazy, Suspense} from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import {Alert, Button, Card, Col, Container, Form, ListGroup, Row, Spinner,} from "react-bootstrap";
import {MusicBrainzApi} from "musicbrainz-api";
import {StarFill, XSquare} from "react-bootstrap-icons";

const mbApi = new MusicBrainzApi({
    appName: "MusicRater",
    appVersion: "1.0",
});

type Entity = "artist" | "release-group" | "recording" | "release";

const throttle = <T extends (...args: any[]) => Promise<any>>(
    fn: T,
    limit: number
) => {
    let lastCall = 0;

    return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
        const now = Date.now();
        if (now - lastCall < limit) {
            await new Promise((resolve) =>
                setTimeout(resolve, limit - (now - lastCall))
            );
        }
        lastCall = now;
        return await fn(...args);
    };
};

const rawSearch = async (type: Entity, query: string) => {
    return await mbApi.search(type, { query });
};

const throttledSearchFn = throttle(rawSearch, 1000);

const throttledSearch = async (type: Entity, query: string) => {
    return await throttledSearchFn(type, query);
};

const rawLookup = async (type: Entity, mbid: string, params: string[]) => {
    return await mbApi.lookup(type, mbid, params);
};

const throttledLookupFn = throttle(rawLookup, 1000);

const throttledLookup = async (
    type: Entity,
    mbid: string,
    params: string[]
) => {
    return await throttledLookupFn(type, mbid, params);
};

interface RatingData {
    [id: string]: Rating;
}

interface Rating {
    rating: number;
    title: string;
    artist?: Artist;
    isAlbum: boolean;
}

interface Song {
    id: string;
    title: string;
}

interface Album {
    id: string;
    title: string;
    "first-release-date"?: string;
    songs?: Song[];
}

interface Artist {
    id: string;
    name: string;
    disambiguation?: string;
    type?: string;
    "begin-area"?: { name: string };
    "life-span"?: { begin?: string; end?: string; ended?: boolean };
    genres?: { name: string }[];
    albums?: Album[];
}

const RatingGraph = lazy(() => import('./RatingGraph'));

const App: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [searchType, setSearchType] = useState<Entity>("artist");
    const [results, setResults] = useState<{
        artists?: Artist[];
        "release-groups"?: Album[];
        recordings?: Song[];
    }>({});
    const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
    const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
    const [ratings, setRatings] = useState<RatingData>(() =>
        JSON.parse(localStorage.getItem("ratings") || "{}")
    );
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [showGraph, setShowGraph] = useState(false);

    useEffect(() => {
        localStorage.setItem("ratings", JSON.stringify(ratings));
    }, [ratings]);

    const clipText = (text: string, maxChars: number) => {
        if (text.length > maxChars) {
            const clipped = text.slice(0, maxChars);
            return clipped + "..."
        }
        return text;
    }

    const handleSearch = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            try {
                const data = await throttledSearch(searchType, searchQuery);
                setResults(data);
                setSelectedArtist(null);
                setSelectedAlbum(null);
            } catch (err) {
                console.log(err);
                setError("Failed to fetch data. Please try again.");
                setResults({});
            } finally {
                setLoading(false);
            }
        },
        [searchQuery, searchType]
    );

    const fetchArtistDetails = useCallback(async (artistId: string) => {
        setLoading(true);
        setError(null);
        try {
            const artist = await throttledLookup("artist", artistId, [
                "release-groups",
                "genres",
            ]);
            const releases =
                artist["release-groups"].filter(
                    (r: any) =>
                        r["primary-type"] === "Album" && !r["secondary-types"].length
                ) || [];
            artist.albums = releases.map((r: any) => ({
                id: r.id,
                title: r.title,
                "first-release-date": r["first-release-date"],
            }));
            setSelectedArtist(artist);
            setSelectedAlbum(null);
        } catch (err) {
            console.log(err);
            setError("Failed to fetch artist details.");
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchAlbumDetails = useCallback(
        async (album: Album) => {
            setLoading(true);
            setError(null);
            try {
                const releaseGroup = await throttledLookup("release-group", album.id, [
                    "releases",
                ]);
                const mainReleaseID = releaseGroup.releases[0].id;
                const release = await throttledLookup("release", mainReleaseID, ["recordings"])
                const songs =
                    release.media[0].tracks.map((t: any) => ({
                        id: t.id,
                        title: t.title,
                    })) || [];
                setSelectedAlbum({ ...album, songs } as Album);
            } catch (err) {
                console.log(err)
                setError("Failed to fetch album details.");
            } finally {
                setLoading(false);
            }
        },
        [selectedAlbum]
    );

    const handleRating = (id: string, rating: number, title: string, isAlbum: boolean, artist?: Artist) => {
        setRatings((prev) => ({ ...prev, [id]: {id, title, artist, isAlbum, rating} }));
    };

    const computeAverage = useMemo(
        () => (ids: string[]) => {
            const rated = ids.filter((id) => ratings[id] && ratings[id].rating && ratings[id].rating !== undefined);
            return rated.length
                ? (
                    rated.reduce((sum, id) => sum + ratings[id].rating, 0) / rated.length
                ).toFixed(1)
                : "N/A";
        },
        [ratings]
    );

    return (
        <Container fluid className="py-4 bg-light min-vh-100">
            <Row className="justify-content-center mb-4">
                <Col xs={12} md={8} lg={6}>
                    <h1 className="text-center mb-4">Music Rater</h1>
                    <Form onSubmit={handleSearch} className="d-flex gap-2">
                        <Form.Select
                            value={searchType}
                            onChange={(e) => setSearchType(e.target.value as Entity)}
                            style={{ width: "120px" }}
                        >
                            <option value="artist">Artist</option>
                            <option value="release-group">Album</option>
                            <option value="recording">Song</option>
                        </Form.Select>
                        <Form.Control
                            type="text"
                            placeholder={`Search for ${searchType}...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <Button type="submit" disabled={loading}>
                            Search
                        </Button>
                    </Form>
                    <Button
                        variant="outline-secondary"
                        className="mt-2"
                        onClick={() => setShowGraph(!showGraph)}
                    >
                        {showGraph ? 'Hide' : 'Show'} Ratings Graph
                    </Button>
                </Col>
            </Row>

            {loading && (
                <Row className="justify-content-center">
                    <Spinner animation="border" />
                </Row>
            )}
            {error && (
                <Row className="justify-content-center">
                    <Alert variant="danger">{error}</Alert>
                </Row>
            )}

            {!loading && !error && (
                <>

                    {/*Artist Display*/}
                    {selectedArtist && !selectedAlbum ? (
                        <Row className="justify-content-center">
                            <Col xs={12} md={8}>
                                <Card className="mb-4 shadow-sm">
                                    <Card.Body>
                                        <Card.Title>{selectedArtist.name}</Card.Title>
                                        <Card.Text>
                                            Genre:{" "}
                                            {selectedArtist.genres?.map((g) => g.name).join(", ") ||
                                                "N/A"}
                                            <br />
                                            Formed: {selectedArtist["life-span"]?.begin || "N/A"}
                                            {selectedArtist["life-span"]?.ended &&
                                                ` - Dissolved: ${
                                                    selectedArtist["life-span"]?.end || "N/A"
                                                }`}
                                            <br />
                                            Avg. Album Rating:{" "}
                                            {computeAverage(
                                                selectedArtist.albums?.map((a) => a.id) || []
                                            )}
                                        </Card.Text>
                                        <Button
                                            variant="outline-primary"
                                            onClick={() => setSelectedArtist(null)}
                                        >
                                            Back to Search
                                        </Button>
                                        <h5 className="mt-3">Albums</h5>
                                        <ListGroup>
                                            {selectedArtist.albums?.map((album) => (
                                                <ListGroup.Item
                                                    key={album.id}
                                                    action
                                                    className="d-flex justify-content-between align-items-center cursor-pointer"
                                                    onClick={() => fetchAlbumDetails(album)}
                                                >
                                                    {album.title}{" "}
                                                    {album["first-release-date"] &&
                                                        `(${album["first-release-date"].split("-")[0]})`}
                                                    <span>
                                                        Rating: {ratings[album.id]?.rating ?? ""}
                                                        <XSquare
                                                            cursor={"pointer"}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRating(album.id, 0, album.title, true, selectedArtist)
                                                            }}
                                                            className={`mx-1 ${ratings[album.id]?.rating > 0 ? "text-warning" : "text-muted"}`}
                                                            size={16}
                                                        />
                                                        {Array.from({ length: 10 }).map((_, i) => (
                                                            <StarFill
                                                                key={i}
                                                                className={`mx-1 ${
                                                                    ratings[album.id]?.rating > i
                                                                        ? "text-warning"
                                                                        : "text-muted"
                                                                }`}
                                                                size={16}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleRating(album.id, i + 1, album.title, true, selectedArtist);
                                                                }}
                                                                style={{ cursor: "pointer" }}
                                                            />
                                                        ))}
                                                    </span>
                                                </ListGroup.Item>
                                            ))}
                                        </ListGroup>
                                    </Card.Body>
                                </Card>
                            </Col>
                        </Row>
                    ) : selectedAlbum ? (

                        // Album Display
                        <Row className="justify-content-center">
                            <Col xs={12} md={8}>
                                <Card className="mb-4 shadow-sm">
                                    <Card.Body>
                                        <Card.Title>{selectedAlbum.title}</Card.Title>
                                        <Card.Text>
                                            Release: {selectedAlbum["first-release-date"] || "N/A"}
                                            <br/>
                                            Avg. Song Rating:{" "}
                                            {computeAverage(
                                                selectedAlbum.songs?.map((a) => a.id) || []
                                            )}
                                        </Card.Text>
                                        <Button
                                            variant="outline-primary"
                                            onClick={() => setSelectedAlbum(null)}
                                        >
                                            {selectedArtist ? "Back to Artist" : "Back to Search"}
                                        </Button>
                                        <h5 className="mt-3">Songs</h5>
                                        {selectedAlbum.songs && (
                                            <ListGroup>
                                                {selectedAlbum.songs.map((song) => (
                                                    <ListGroup.Item
                                                        key={song.id}
                                                        className="d-flex justify-content-between align-items-center"
                                                    >
                                                        {song.title}
                                                        <span>
                                                            Rating: {ratings[song.id]?.rating ?? ""}
                                                            <XSquare
                                                                cursor={"pointer"}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleRating(song.id, 0, selectedAlbum.title, false, selectedArtist ? selectedArtist : undefined)
                                                                }}
                                                                className={`mx-1 ${ratings[song.id]?.rating > 0 ? "text-warning" : "text-muted"}`}
                                                                size={16}
                                                            />
                                                            {Array.from({ length: 10 }).map((_, i) => (
                                                                <StarFill
                                                                    key={i}
                                                                    className={`mx-1 ${
                                                                        ratings[song.id]?.rating > i
                                                                            ? "text-warning"
                                                                            : "text-muted"
                                                                    }`}
                                                                    size={16}
                                                                    onClick={() => handleRating(song.id, i + 1, selectedAlbum.title, false, selectedArtist ? selectedArtist : undefined)}
                                                                    style={{ cursor: "pointer" }}
                                                                />
                                                            ))}
                                                        </span>
                                                    </ListGroup.Item>
                                                ))}
                                            </ListGroup>
                                        )}
                                    </Card.Body>
                                </Card>
                            </Col>
                        </Row>
                    ) : (
                        <Row className="justify-content-center">
                            <Col xs={12} md={8}>
                                {results.artists?.length ||
                                results["release-groups"]?.length ||
                                results.recordings?.length ? (
                                    <Card className="shadow-sm">
                                        <Card.Body>
                                            <h5>Search Results</h5>
                                            {/*Artist Search Results*/}
                                            {searchType === "artist" &&
                                                results.artists?.map((artist) => (
                                                    <ListGroup.Item
                                                        key={artist.id}
                                                        action
                                                        className="d-flex justify-content-between align-items-center cursor-pointer"
                                                        onClick={() => fetchArtistDetails(artist.id)}
                                                    >
                                                        <span>
                                                          {artist.name}{" "}
                                                            <div className="text-secondary">
                                                            {artist.disambiguation}
                                                          </div>
                                                        </span>
                                                    </ListGroup.Item>
                                                ))}

                                            {/*Album Search Result*/}
                                            {searchType === "release-group" &&
                                                results["release-groups"]?.map((release) => (
                                                    <ListGroup.Item
                                                        key={release.id}
                                                        className="d-flex justify-content-between align-items-center"
                                                        action
                                                        onClick={() => fetchAlbumDetails(release)}
                                                    >
                                                        <span>
                                                            {clipText(release.title, 40)}
                                                            <div className="text-secondary d-flex">
                                                                {clipText(release["artist-credit"][0].name, 30)}
                                                                {" - "}
                                                                {release["first-release-date"]?.slice(0, 4)}
                                                            </div>
                                                        </span>
                                                        <span>
                                                            Rating: {ratings[release.id]?.rating ?? ""}
                                                            <XSquare
                                                                cursor={"pointer"}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleRating(release.id, 0, release.title, true)
                                                                }}
                                                                className={`mx-1 ${ratings[release.id]?.rating > 0 ? "text-warning" : "text-muted"}`}
                                                                size={16}
                                                            />
                                                            {Array.from({length: 10}).map((_, i) => (
                                                                <StarFill
                                                                    key={i}
                                                                    className={`mx-1 ${
                                                                        ratings[release.id]?.rating > i
                                                                            ? "text-warning"
                                                                            : "text-muted"
                                                                    }`}
                                                                    size={16}
                                                                    onClick={() => handleRating(release.id, i + 1, release.title, true)}
                                                                    style={{cursor: "pointer"}}
                                                                />
                                                            ))}
                                                        </span>
                                                    </ListGroup.Item>
                                                ))}

                                            {/*Song Search Result*/}
                                            {searchType === "recording" &&
                                                results.recordings?.map((recording) => (
                                                    <ListGroup.Item
                                                        key={recording.id}
                                                        className="d-flex justify-content-between align-items-center"
                                                    >
                                                        <span>
                                                            {clipText(recording.title, 40)}
                                                            <div className="text-secondary d-flex">
                                                                {clipText(recording["artist-credit"][0].name, 30)}
                                                                {" - "}
                                                                {recording["first-release-date"]?.slice(0, 4)}
                                                            </div>
                                                        </span>
                                                        <span>
                                                            Rating: {ratings[recording.id]?.rating ?? ""}
                                                            <XSquare
                                                                cursor={"pointer"}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleRating(recording.id, 0, recording.title, false)
                                                                }}
                                                                className={`mx-1 ${ratings[recording.id]?.rating > 0 ? "text-warning" : "text-muted"}`}
                                                                size={16}
                                                            />
                                                            {Array.from({length: 10}).map((_, i) => (
                                                                <StarFill
                                                                    key={i}
                                                                    className={`mx-1 ${
                                                                        ratings[recording.id]?.rating > i
                                                                            ? "text-warning"
                                                                            : "text-muted"
                                                                    }`}
                                                                    size={16}
                                                                    onClick={() => handleRating(recording.id, i + 1, recording.title, false)}
                                                                    style={{cursor: "pointer"}}
                                                                />
                                                            ))}
                                                        </span>
                                                    </ListGroup.Item>
                                                ))}
                                        </Card.Body>
                                    </Card>
                                ) : (
                                    !loading && (
                                        <Alert variant="info">
                                            No results found. Try a different search.
                                        </Alert>
                                    )
                                )}
                            </Col>
                        </Row>
                    )}
                    {showGraph && (
                        <Suspense fallback={<Spinner animation="border" />}>
                            <RatingGraph ratings={ratings} />
                        </Suspense>
                    )}
                </>
            )}
        </Container>
    );
};

export default App;
